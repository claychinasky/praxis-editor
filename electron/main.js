const { app, BrowserWindow, ipcMain, protocol, Notification } = require('electron');
const { join, resolve, dirname } = require('path');
const { readFileSync, existsSync } = require('fs');
const { createServer } = require('http');
const { parse } = require('url');
const axios = require('axios');
const vm = require('vm');

let mainWindow = null;
let authWindow = null;
let oauthServer = null;
let ENV = null;
let forceQuit = false;
let isOAuthServerClosed = false;

// Register protocol schemes before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } }
]);

// Load environment variables
function loadEnvVars() {
  const isDev = process.env.NODE_ENV === 'development';
  const appPath = app.getAppPath();
  console.log('App path:', appPath);
  console.log('Development mode:', isDev);
  console.log('Current directory:', __dirname);
  console.log('App directory:', dirname(appPath));

  // Also check for config in the app's root directory
  const possiblePaths = [
    join(dirname(appPath), 'app', 'electron', 'config.js'),
    join(appPath, 'electron', 'config.js'),
    join(__dirname, 'config.js'),
    join(dirname(appPath), '..', '.dev.vars'),  // Check one level up
    join(dirname(appPath), '.dev.vars'),
    join(appPath, '.dev.vars'),
    join(__dirname, '.dev.vars')
  ];
  
  console.log('Checking possible config paths:', JSON.stringify(possiblePaths, null, 2));
  
  let config = null;
  let errors = [];
  
  for (const path of possiblePaths) {
    try {
      console.log('Checking config path:', path);
      if (existsSync(path)) {
        console.log('Found config at:', path);
        
        if (path.endsWith('.dev.vars')) {
          const content = readFileSync(path, 'utf8');
          const vars = {};
          content.split('\n').forEach(line => {
            const [key, value] = line.split('=').map(s => s.trim());
            if (key && value) {
              vars[key] = value.replace(/^["']|["']$/g, '');
            }
          });
          config = {
            GITHUB_CLIENT_ID: vars.GITHUB_CLIENT_ID || '',
            GITHUB_CLIENT_SECRET: vars.GITHUB_CLIENT_SECRET || ''
          };
        } else {
          const configContent = readFileSync(path, 'utf8');
          console.log('Config content length:', configContent.length);
          
          if (!configContent || configContent.length < 10) {
            const error = `Config file at ${path} is empty or invalid`;
            console.error(error);
            errors.push(error);
            continue;
          }
          
          const context = { 
            module: { exports: {} }, 
            exports: {},
            require,
            console,
            __dirname,
            __filename: path,
            process
          };
          
          vm.runInNewContext(configContent, context);
          const configModule = context.module.exports;
          config = configModule.loadEnvVars ? configModule.loadEnvVars() : configModule.getConfig();
          
          console.log('Parsed config:', { ...config, GITHUB_CLIENT_SECRET: '[REDACTED]' });
          
          if (!config || !config.GITHUB_CLIENT_ID || !config.GITHUB_CLIENT_SECRET) {
            const error = `Config at ${path} is missing required fields`;
            console.error(error);
            errors.push(error);
            continue;
          }
          
          console.log('Successfully loaded config from:', path);
          break;
        }
      } else {
        console.log('Config file does not exist at:', path);
      }
    } catch (error) {
      const errorMsg = `Error loading config from ${path}: ${error.message}`;
      console.error(errorMsg);
      errors.push(errorMsg);
    }
  }
  
  if (!config) {
    console.error('All config loading attempts failed. Errors:', errors);
    throw new Error(`Failed to load config from any location. Errors:\n${errors.join('\n')}`);
  }
  
  return config;
}

// Notification helper function
function showNotification(title, body, type = 'info') {
  if (Notification.isSupported()) {
    const notification = new Notification({
      title,
      body,
      icon: type === 'error' ? join(__dirname, '../assets/error.png') : join(__dirname, '../assets/info.png')
    });
    notification.show();
  }
  // Also send to renderer process for in-app notifications
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app-notification', { title, body, type });
  }
}

// Global error handler
function handleError(error, source = 'Application') {
  const errorMessage = error.message || 'An unknown error occurred';
  showNotification(`${source} Error`, errorMessage, 'error');
  
  if (process.env.NODE_ENV === 'development') {
    console.error(`[${source}]`, error);
  }
}

// Handle OAuth callback
function handleOAuthCallback(req, res) {
  try {
    console.log('Handling OAuth callback');
    const urlParts = parse(req.url, true);
    const code = urlParts.query.code;

    if (!code) {
      showNotification('Authentication Error', 'No authorization code received', 'error');
      res.writeHead(400);
      res.end('Authentication failed: No code received');
      return;
    }

    console.log('OAuth exchange parameters:', {
      client_id: ENV.GITHUB_CLIENT_ID,
      client_secret: '[REDACTED]',
      code,
      redirect_uri: 'http://localhost:8788/auth/callback'
    });

    axios.post('https://github.com/login/oauth/access_token', {
      client_id: ENV.GITHUB_CLIENT_ID,
      client_secret: ENV.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: 'http://localhost:8788/auth/callback'
    }, {
      headers: {
        Accept: 'application/json'
      }
    })
    .then(tokenResponse => {
      if (tokenResponse.data.error) {
        showNotification('Authentication Error', tokenResponse.data.error_description || 'Failed to authenticate with GitHub', 'error');
        throw new Error(tokenResponse.data.error_description || 'GitHub authentication failed');
      }

      // Send token to renderer process
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('oauth-response', tokenResponse.data);
        showNotification('Success', 'Successfully authenticated with GitHub', 'info');
      }

      // Send a response that closes itself
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`
        <html>
          <head>
            <title>Authentication Successful</title>
            <script>
              window.onload = function() {
                window.close();
              }
            </script>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background-color: #f5f5f5;
                color: #333;
              }
              .container {
                text-align: center;
                padding: 2rem;
                background: white;
                border-radius: 8px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
              }
              h1 {
                margin-bottom: 1rem;
                color: #2c3e50;
              }
              p {
                margin: 0;
                color: #666;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Authentication Successful!</h1>
              <p>This window will close automatically...</p>
            </div>
          </body>
        </html>
      `);

      // Close auth window after a short delay
      setTimeout(() => {
        if (authWindow && !authWindow.isDestroyed()) {
          console.log('Closing auth window');
          authWindow.close();
        }
      }, 1500);

    })
    .catch(error => {
      console.error('Error in OAuth callback:', error);
      res.writeHead(500);
      res.end('Authentication failed');
      
      if (authWindow && !authWindow.isDestroyed()) {
        authWindow.close();
      }
    });
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    res.writeHead(500);
    res.end('Authentication failed');
    
    if (authWindow && !authWindow.isDestroyed()) {
      authWindow.close();
    }
  }
}

// Register custom file protocol
function registerFileProtocol() {
  protocol.handle('app', (request) => {
    try {
      let url = request.url.substr(6); // Remove 'app://'
      // Remove any leading slash
      url = url.replace(/^\/+/, '');
      
      console.log('Protocol request for:', url);
      
      const filePath = join(__dirname, '..', 'dist', url);
      console.log('Resolved file path:', filePath);
      
      if (existsSync(filePath)) {
        console.log('File found:', filePath);
        return require('electron').net.fetch('file://' + filePath);
      }
      
      console.error('File not found:', filePath);
      return new require('electron').Response('Not found', { status: 404 });
    } catch (error) {
      console.error('Protocol handler error:', error);
      return new require('electron').Response('Internal error', { status: 500 });
    }
  });
  console.log('Registered app:// protocol handler');
}

// Function to safely close OAuth server
function closeOAuthServer() {
  if (oauthServer && !isOAuthServerClosed) {
    console.log('Closing OAuth server');
    oauthServer.close(() => {
      console.log('OAuth server closed successfully');
      isOAuthServerClosed = true;
      oauthServer = null;
    });
  }
}

// Function to create OAuth server
function createOAuthServer() {
  if (oauthServer) {
    console.log('OAuth server already exists');
    return;
  }

  console.log('Creating OAuth server');
  oauthServer = createServer((req, res) => {
    const urlParts = parse(req.url, true);
    console.log('OAuth server received request:', urlParts.pathname);

    if (urlParts.pathname === '/auth/callback') {
      handleOAuthCallback(req, res);
    } else if (urlParts.pathname === '/') {
      // Redirect to GitHub OAuth
      const githubAuthUrl = new URL('https://github.com/login/oauth/authorize');
      githubAuthUrl.searchParams.set('client_id', ENV.GITHUB_CLIENT_ID);
      githubAuthUrl.searchParams.set('redirect_uri', 'http://localhost:8788/auth/callback');
      githubAuthUrl.searchParams.set('scope', 'repo');
      
      console.log('Redirecting to GitHub OAuth:', githubAuthUrl.toString());
      
      res.writeHead(302, {
        'Location': githubAuthUrl.toString()
      });
      res.end();
    } else {
      console.log('Not found:', urlParts.pathname);
      res.writeHead(404);
      res.end('Not found');
    }
  });

  isOAuthServerClosed = false;
  oauthServer.listen(8788, () => {
    console.log('OAuth callback server listening on port 8788');
  });

  oauthServer.on('error', (error) => {
    console.error('OAuth server error:', error);
    if (error.code === 'EADDRINUSE') {
      console.log('Port 8788 is in use, attempting to close existing server');
      closeOAuthServer();
      setTimeout(createOAuthServer, 1000);
    }
  });
}

function createWindow() {
  try {
    console.log('Creating window with __dirname:', __dirname);
    console.log('App path:', app.getAppPath());
    console.log('App getPath(exe):', app.getPath('exe'));
    console.log('App getPath(userData):', app.getPath('userData'));

    // Create OAuth server if it doesn't exist
    createOAuthServer();

    // Check preload script
    const preloadPath = join(__dirname, 'preload.js');
    console.log('Checking preload script at:', preloadPath);
    
    // In production, the preload script might be in the app.asar.unpacked directory
    let finalPreloadPath = preloadPath;
    if (process.env.NODE_ENV !== 'development' && !existsSync(preloadPath)) {
      const unpackedPath = preloadPath.replace('app.asar', 'app.asar.unpacked');
      console.log('Checking unpacked preload script at:', unpackedPath);
      if (existsSync(unpackedPath)) {
        finalPreloadPath = unpackedPath;
      } else {
        throw new Error(`Preload script not found at: ${preloadPath} or ${unpackedPath}`);
      }
    }
    
    console.log('Using preload script at:', finalPreloadPath);
    console.log('Preload script size:', readFileSync(finalPreloadPath).length, 'bytes');

    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        enableRemoteModule: false,
        preload: finalPreloadPath,
        webSecurity: true,
        sandbox: false
      },
      show: false // Don't show the window until it's ready
    });

    // Debug window creation
    console.log('Window created with webPreferences:', {
      ...mainWindow.webContents.getLastWebPreferences(),
      preload: finalPreloadPath
    });

    // Set up window event handlers
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('Failed to load:', { errorCode, errorDescription });
    });

    mainWindow.webContents.on('did-finish-load', () => {
      console.log('Window finished loading');
      if (!mainWindow.isVisible()) {
        mainWindow.show();
      }
    });

    mainWindow.webContents.on('crashed', (event) => {
      console.error('Window crashed:', event);
    });

    mainWindow.on('unresponsive', () => {
      console.error('Window became unresponsive');
    });

    mainWindow.on('close', (event) => {
      console.log('Window close event triggered');
      if (process.platform === 'darwin' && !forceQuit) {
        event.preventDefault();
        mainWindow.hide();
      } else {
        closeOAuthServer();
      }
    });

    mainWindow.on('closed', () => {
      console.log('Window closed event');
      mainWindow = null;
      if (process.platform !== 'darwin' || forceQuit) {
        app.quit();
      }
    });

    // Load the app
    if (process.env.NODE_ENV === 'development') {
      console.log('Loading app in development mode');
      mainWindow.loadURL('http://localhost:5173');
      mainWindow.webContents.openDevTools();
    } else {
      console.log('Loading app in production mode');
      registerFileProtocol();
      
      const indexPath = join(__dirname, '..', 'dist', 'index.html');
      console.log('Loading index.html from:', indexPath);
      
      if (!existsSync(indexPath)) {
        throw new Error(`index.html not found at ${indexPath}`);
      }

      // Load the file using app:// protocol with the correct path
      const appUrl = 'app://./index.html';
      console.log('Loading app from URL:', appUrl);
      mainWindow.loadURL(appUrl);
      console.log('Successfully loaded index.html');
    }

    return mainWindow;
  } catch (error) {
    console.error('Error in createWindow:', error);
    throw error;
  }
}

// Initialize app
app.whenReady().then(async () => {
  try {
    console.log('App is ready');
    
    // Load environment variables
    ENV = loadEnvVars();
    console.log('Loaded environment variables:', { ...ENV, GITHUB_CLIENT_SECRET: '[REDACTED]' });
    
    // Validate environment variables
    const requiredVars = ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'];
    const missingVars = requiredVars.filter(varName => !ENV[varName]);
    
    if (missingVars.length > 0) {
      console.error('Missing required environment variables:', missingVars);
      app.exit(1);
      return;
    }

    // Store environment variables in process.env BEFORE creating window
    Object.keys(ENV).forEach(key => {
      if (ENV[key]) {
        process.env[key] = ENV[key];
        if (key !== 'GITHUB_CLIENT_SECRET') {
          console.log(`Set process.env.${key} to:`, process.env[key]);
        }
      }
    });
    
    // Create window
    await createWindow();

    // Set up GitHub auth URL interceptor
    const filter = {
      urls: ['https://github.com/login/oauth/authorize*']
    };

    require('electron').session.defaultSession.webRequest.onBeforeRequest(filter, (details, callback) => {
      const url = new URL(details.url);
      
      // Only modify if redirect_uri is missing or different
      const currentRedirect = url.searchParams.get('redirect_uri');
      if (!currentRedirect || currentRedirect !== 'http://localhost:8788/auth/callback') {
        console.log('Setting redirect_uri in GitHub auth URL');
        url.searchParams.set('redirect_uri', 'http://localhost:8788/auth/callback');
        callback({ redirectURL: url.toString() });
      } else {
        console.log('Redirect URI already correct, proceeding');
        callback({});
      }
    });
    
    app.on('activate', () => {
      if (mainWindow === null) {
        createWindow();
      }
    });
    
  } catch (error) {
    handleError(error, 'Initialization');
  }
});

// Handle window events
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  console.log('App before-quit event');
  forceQuit = true;
});

// Handle macOS dock click
app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    try {
      await createWindow();
    } catch (error) {
      handleError(error, 'Window Creation');
    }
  }
});

// Add handler for opening OAuth window
require('electron').ipcMain.on('open-oauth-window', (event, url) => {
  try {
    console.log('Opening OAuth window for URL:', url);
    
    // Close existing auth window if it exists
    if (authWindow && !authWindow.isDestroyed()) {
      console.log('Closing existing auth window');
      authWindow.close();
      authWindow = null;
    }
    
    authWindow = new BrowserWindow({
      width: 800,
      height: 600,
      parent: mainWindow,
      modal: true,
      show: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        webSecurity: true
      }
    });

    console.log('Created auth window, loading URL:', 'http://localhost:8788/');

    // Use our local server as the entry point
    authWindow.loadURL('http://localhost:8788/').catch(error => {
      console.error('Failed to load auth URL:', error);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('oauth-response', { error: 'Failed to load authentication page' });
      }
    });

    authWindow.webContents.on('did-finish-load', () => {
      console.log('Auth window loaded, showing window');
      authWindow.show();
    });

    authWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('Auth window failed to load:', { errorCode, errorDescription });
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('oauth-response', { error: `Failed to load: ${errorDescription}` });
      }
    });

    authWindow.on('closed', () => {
      console.log('Auth window closed');
      authWindow = null;
    });

  } catch (error) {
    console.error('Error opening OAuth window:', error);
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('oauth-response', { error: error.message });
    }
  }
});

// Handle errors
process.on('uncaughtException', (error) => {
  handleError(error, 'Uncaught Exception');
});

process.on('unhandledRejection', (error) => {
  handleError(error, 'Unhandled Rejection');
});

// Add IPC handlers for renderer process communication
require('electron').ipcMain.on('app-ready', () => {
  console.log('Renderer process reported ready');
});

require('electron').ipcMain.on('auth-error', (event, error) => {
  console.error('Authentication error from renderer:', error);
});
