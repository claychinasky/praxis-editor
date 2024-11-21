import { app, BrowserWindow, session, protocol } from 'electron';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';
import axios from 'axios';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isDev = process.env.NODE_ENV === 'development';
const WRANGLER_URL = 'http://127.0.0.1:8788';
const BASE_URL = isDev ? WRANGLER_URL : 'app://./';

// Register protocol before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

let mainWindow;
let serverProcess;

async function waitForServer(url, maxAttempts = 30) {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      await axios.get(url);
      console.log('Wrangler development server is ready');
      return true;
    } catch (error) {
      console.log(`Waiting for Wrangler server... (${i + 1}/${maxAttempts})`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  console.error('Wrangler server failed to start');
  return false;
}

function createProtocol() {
  console.log('Creating app:// protocol');
  if (!protocol.isProtocolRegistered('app')) {
    protocol.registerFileProtocol('app', (request, callback) => {
      const url = request.url.replace('app://./', '');
      try {
        // Handle auth routes in production
        if (url.startsWith('auth/')) {
          // Redirect auth requests to GitHub
          if (url === 'auth/login') {
            const githubAuthUrl = `https://github.com/login/oauth/authorize?` +
              `client_id=Ov23liVwAcpifaYkIuvL&` +
              `redirect_uri=app://./auth/callback&` +
              `scope=repo&` +
              `response_type=code`;
            mainWindow.loadURL(githubAuthUrl);
            return callback({ error: -6 }); // Prevent file load
          }
          return callback({ error: -6 }); // Prevent file load for other auth routes
        }

        // In production, look for files in the asar's dist directory
        const filePath = join(app.getAppPath(), 'dist', url);
        console.log('Loading file:', filePath);
        callback({ path: filePath });
      } catch (error) {
        console.error('Protocol error:', error);
        return callback({ error: -2 /* FAILED */ });
      }
    });
  }
}

function createWindow() {
  console.log('Creating window...');
  console.log('App path:', app.getAppPath());
  console.log('isDev:', isDev);

  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: true,
      devTools: true,
      webviewTag: true
    }
  });

  // Handle navigation
  mainWindow.webContents.on('will-navigate', (event, url) => {
    console.log('Navigation requested:', url);
    
    // Allow GitHub OAuth URLs and session endpoints
    if (url.startsWith('https://github.com/login/oauth') || 
        url.startsWith('https://github.com/session')) {
      console.log('Allowing GitHub auth URL');
      return;
    }
    
    // Convert file:// auth paths to use development server
    if (url.startsWith('file:///') && url.includes('/auth/')) {
      event.preventDefault();
      const authPath = url.split('/auth/')[1];
      const redirectUrl = `${WRANGLER_URL}/auth/${authPath}`;
      console.log('Redirecting auth to:', redirectUrl);
      mainWindow.loadURL(redirectUrl);
      return;
    }
    
    // Allow our app URLs
    if (url.startsWith(BASE_URL) || url.startsWith('app://')) {
      console.log('Allowing app URL');
      return;
    }

    // Prevent other external navigation
    console.log('Blocking external navigation');
    event.preventDefault();
  });

  // Handle OAuth callback
  mainWindow.webContents.on('will-redirect', (event, url) => {
    console.log('Redirect requested:', url);
    
    // Allow GitHub OAuth URLs and session endpoints
    if (url.startsWith('https://github.com/session')) {
      console.log('Processing GitHub session');
      return;
    }

    // Handle OAuth callback at root URL
    if (url.startsWith('http://127.0.0.1:8788') && url.includes('?code=')) {
      event.preventDefault();
      const code = new URL(url).searchParams.get('code');
      const callbackUrl = `${WRANGLER_URL}/auth/callback?code=${code}`;
      console.log('Redirecting OAuth callback to:', callbackUrl);
      mainWindow.loadURL(callbackUrl);
      return;
    }

    // Handle token redirect
    if (url.includes('access_token=')) {
      event.preventDefault();
      const token = new URL(url).searchParams.get('access_token');
      // Load the app URL with the token
      const appUrl = isDev ? 
        `${WRANGLER_URL}/?access_token=${token}` :
        `app://./index.html?access_token=${token}`;
      mainWindow.loadURL(appUrl);
      return;
    }
  });

  // Load the index.html file.
  try {
    if (isDev) {
      console.log('Loading development URL:', BASE_URL);
      mainWindow.loadURL(BASE_URL);
    } else {
      const indexPath = join(app.getAppPath(), 'dist', 'index.html');
      console.log('Loading production file:', indexPath);
      mainWindow.loadFile(indexPath).catch(err => {
        console.error('Failed to load index.html:', err);
        const protocolUrl = 'app://./index.html';
        console.log('Trying protocol URL:', protocolUrl);
        mainWindow.loadURL(protocolUrl);
      });
    }
  } catch (error) {
    console.error('Error loading window content:', error);
  }

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('Finished loading');
    mainWindow.show();
    console.log('Window ready to show');
    // Always open DevTools
    mainWindow.webContents.openDevTools();
  });

  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
  });

  // Log any console messages from the renderer
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log('Renderer:', message);
  });

  // Prevent window close by accident
  mainWindow.on('close', (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
    return false;
  });

  mainWindow.on('closed', () => {
    console.log('Window closed');
    mainWindow = null;
  });
}

async function startDevServer() {
  if (isDev) {
    console.log('Starting Wrangler development server...');
    serverProcess = spawn('npm', ['run', 'dev'], {
      shell: true,
      env: {
        ...process.env,
        GITHUB_CLIENT_ID: 'Ov23liVwAcpifaYkIuvL',
        GITHUB_CLIENT_SECRET: '1feff5a26dc20f09c388c8f0955d09763cdea853',
        BASE_URL: WRANGLER_URL
      },
      stdio: 'inherit'
    });

    serverProcess.on('error', (error) => {
      console.error('Failed to start Wrangler server:', error);
    });

    // Wait for Wrangler to be ready
    const serverReady = await waitForServer(WRANGLER_URL);
    if (!serverReady) {
      console.error('Failed to start Wrangler server');
      app.quit();
      return false;
    }
    return true;
  }
  return true;
}

// Register file protocol handler
app.whenReady().then(async () => {
  console.log('App is ready');
  console.log('Development mode:', isDev);
  console.log('App path:', app.getAppPath());

  if (!isDev) {
    console.log('Setting up production protocols');
    createProtocol();
  } else {
    console.log('Starting development server...');
    const serverStarted = await startDevServer();
    if (!serverStarted) {
      console.error('Failed to start development server');
      app.quit();
      return;
    }
  }

  createWindow();
});

// Handle window-all-closed event
app.on('window-all-closed', () => {
  console.log('All windows closed');
  if (process.platform !== 'darwin') {
    app.isQuitting = true;
    if (serverProcess) {
      serverProcess.kill();
    }
    app.quit();
  }
});

// Quit the app
app.on('before-quit', () => {
  console.log('App is quitting...');
  app.isQuitting = true;
  if (serverProcess) {
    serverProcess.kill();
  }
});

// Log any unhandled errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
});
