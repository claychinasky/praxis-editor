const { app, BrowserWindow, ipcMain, protocol, Notification, shell } = require('electron');
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
let currentCredentials = null;

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

// Function to create OAuth server
function createOAuthServer() {
  try {
    if (oauthServer) {
      console.log('OAuth server already exists');
      return;
    }

    console.log('Creating OAuth server');
    oauthServer = createServer((req, res) => {
      try {
        const urlParts = parse(req.url, true);
        console.log('OAuth server received request:', urlParts.pathname);
        console.log('Query parameters:', urlParts.query);

        // Add CORS headers
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        // Handle preflight
        if (req.method === 'OPTIONS') {
          res.writeHead(200);
          res.end();
          return;
        }

        if (urlParts.pathname === '/auth/callback') {
          console.log('Handling OAuth callback');
          handleOAuthCallback(req, res);
        } else if (urlParts.pathname === '/auth/revoke' && req.method === 'POST') {
          handleTokenRevocation(req, res);
        } else {
          console.log('Unknown endpoint:', urlParts.pathname);
          res.writeHead(404);
          res.end('Not found');
        }
      } catch (error) {
        console.error('Error handling request:', error);
        res.writeHead(500);
        res.end('Internal server error');
      }
    });

    // Try to close any existing server on the port
    try {
      require('http').get('http://localhost:8788/health', () => {
        console.log('Found existing server, attempting to close');
        closeOAuthServer();
      }).on('error', () => {
        // No server running, which is what we want
      });
    } catch (error) {
      // Ignore errors here
    }

    oauthServer.listen(8788, 'localhost', () => {
      console.log('OAuth server listening on http://localhost:8788');
    });

    oauthServer.on('error', (error) => {
      console.error('OAuth server error:', error);
      if (error.code === 'EADDRINUSE') {
        console.log('Port 8788 is in use, attempting to close existing server');
        closeOAuthServer();
        setTimeout(createOAuthServer, 1000);
      }
    });
  } catch (error) {
    console.error('Error creating OAuth server:', error);
  }
}

// Handle OAuth callback
function handleOAuthCallback(req, res) {
  try {
    console.log('Handling OAuth callback');
    const urlParts = parse(req.url, true);
    const code = urlParts.query.code;

    console.log('Received code:', code ? 'yes' : 'no');
    console.log('Current credentials:', currentCredentials ? 'available' : 'not available');

    if (!code) {
      const errorHtml = `
        <html>
          <head>
            <title>Authentication Error</title>
            <style>
              body { font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; padding: 2rem; }
              .container { max-width: 600px; margin: 0 auto; text-align: center; }
              .error { color: #dc3545; margin: 1rem 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Authentication Error</h1>
              <p class="error">No authorization code received</p>
              <p>Please close this window and try again.</p>
            </div>
          </body>
        </html>
      `;
      showNotification('Authentication Error', 'No authorization code received', 'error');
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(errorHtml);
      return;
    }

    if (!currentCredentials) {
      const errorHtml = `
        <html>
          <head>
            <title>Authentication Error</title>
            <style>
              body { font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; padding: 2rem; }
              .container { max-width: 600px; margin: 0 auto; text-align: center; }
              .error { color: #dc3545; margin: 1rem 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Authentication Error</h1>
              <p class="error">No credentials available</p>
              <p>Please close this window and try again.</p>
            </div>
          </body>
        </html>
      `;
      showNotification('Authentication Error', 'No credentials available', 'error');
      res.writeHead(400, { 'Content-Type': 'text/html' });
      res.end(errorHtml);
      return;
    }

    // Show loading page while we exchange the code
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.write(`
      <html>
        <head>
          <title>Authenticating...</title>
          <style>
            body { font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; padding: 2rem; }
            .container { max-width: 600px; margin: 0 auto; text-align: center; }
            .spinner { display: inline-block; width: 50px; height: 50px; border: 3px solid #f3f3f3; border-top: 3px solid #3498db; border-radius: 50%; animation: spin 1s linear infinite; }
            @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Authenticating with GitHub</h1>
            <div class="spinner"></div>
            <p>Please wait while we complete the authentication process...</p>
          </div>
        </body>
      </html>
    `);

    console.log('OAuth exchange parameters:', {
      client_id: currentCredentials.clientId,
      redirect_uri: currentCredentials.redirectUri,
      code_length: code.length
    });

    axios.post('https://github.com/login/oauth/access_token', {
      client_id: currentCredentials.clientId,
      client_secret: currentCredentials.clientSecret,
      code,
      redirect_uri: currentCredentials.redirectUri
    }, {
      headers: {
        Accept: 'application/json'
      }
    })
    .then(response => {
      console.log('Received OAuth response');
      
      if (response.data.access_token) {
        // Send the token back to the renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('oauth-response', response.data);
        }
        
        // Show success page and close after 3 seconds
        res.write(`
          <html>
            <head>
              <title>Authentication Successful</title>
              <style>
                body { font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; padding: 2rem; }
                .container { max-width: 600px; margin: 0 auto; text-align: center; }
                .success { color: #28a745; margin: 1rem 0; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>Authentication Successful!</h1>
                <p class="success">You have successfully authenticated with GitHub.</p>
                <p>This window will close in <span id="countdown">3</span> seconds...</p>
              </div>
              <script>
                document.addEventListener('DOMContentLoaded', () => {
                  let countdown = 3;
                  const countdownElement = document.getElementById('countdown');
                  
                  function updateCountdown() {
                    countdown--;
                    countdownElement.textContent = countdown;
                    if (countdown > 0) {
                      setTimeout(updateCountdown, 1000);
                    } else {
                      window.close();
                    }
                  }

                  setTimeout(updateCountdown, 1000);
                });
              </script>
            </body>
          </html>
        `);
        res.end();
      } else {
        console.error('No access token in response:', response.data);
        showNotification('Authentication Error', 'Failed to get access token', 'error');
        res.write(`
          <html>
            <head>
              <title>Authentication Error</title>
              <style>
                body { font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; padding: 2rem; }
                .container { max-width: 600px; margin: 0 auto; text-align: center; }
                .error { color: #dc3545; margin: 1rem 0; }
              </style>
            </head>
            <body>
              <div class="container">
                <h1>Authentication Error</h1>
                <p class="error">Failed to get access token</p>
                <p>Please close this window and try again.</p>
              </div>
            </body>
          </html>
        `);
        res.end();
      }
    })
    .catch(error => {
      console.error('Error exchanging code for token:', error);
      showNotification('Authentication Error', 'Failed to exchange code for token', 'error');
      res.write(`
        <html>
          <head>
            <title>Authentication Error</title>
            <style>
              body { font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; padding: 2rem; }
              .container { max-width: 600px; margin: 0 auto; text-align: center; }
              .error { color: #dc3545; margin: 1rem 0; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Authentication Error</h1>
              <p class="error">Failed to exchange code for token</p>
              <p>Error: ${error.message}</p>
              <p>Please close this window and try again.</p>
            </div>
          </body>
        </html>
      `);
      res.end();
    });
  } catch (error) {
    console.error('Error in OAuth callback:', error);
    showNotification('Authentication Error', error.message, 'error');
    res.writeHead(500, { 'Content-Type': 'text/html' });
    res.end(`
      <html>
        <head>
          <title>Authentication Error</title>
          <style>
            body { font-family: -apple-system, system-ui, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; padding: 2rem; }
            .container { max-width: 600px; margin: 0 auto; text-align: center; }
            .error { color: #dc3545; margin: 1rem 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>Authentication Error</h1>
            <p class="error">Internal Server Error</p>
            <p>Error: ${error.message}</p>
            <p>Please close this window and try again.</p>
          </div>
        </body>
      </html>
    `);
  }
}

// Handle token revocation
async function handleTokenRevocation(req, res) {
  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', async () => {
    try {
      const { token, clientId, clientSecret } = JSON.parse(body);
      
      if (!token || !clientId || !clientSecret) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Missing required parameters' }));
        return;
      }

      // Call GitHub's token revocation endpoint
      try {
        await axios.delete('https://api.github.com/applications/' + clientId + '/token', {
          auth: {
            username: clientId,
            password: clientSecret
          },
          data: {
            access_token: token
          }
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ message: 'Token revoked successfully' }));
      } catch (error) {
        console.error('Error revoking token:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to revoke token' }));
      }
    } catch (error) {
      console.error('Error parsing request:', error);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid request body' }));
    }
  });
}

// Register app protocol
function registerProtocol() {
  try {
    console.log('Registering app protocol');
    
    protocol.registerFileProtocol('app', (request, callback) => {
      console.log('App protocol request:', request.url);
      
      const url = request.url.replace('app://./', '');
      console.log('Parsed URL:', url);
      
      if (url.startsWith('auth/callback')) {
        // Handle OAuth callback
        const callbackUrl = new URL(request.url);
        const code = callbackUrl.searchParams.get('code');
        if (code) {
          handleOAuthCallback({ url: request.url, query: { code } }, {
            writeHead: (status, headers) => {
              console.log('OAuth callback response:', status, headers);
            },
            end: (content) => {
              console.log('OAuth callback complete:', content);
            }
          });
        }
        return;
      }

      // Serve static files from the dist directory
      const filePath = join(__dirname, '..', 'dist', url);
      console.log('Resolved file path:', filePath);
      
      if (existsSync(filePath)) {
        console.log('File found:', filePath);
        callback({ path: filePath });
      } else {
        console.error('File not found:', filePath);
        callback({ error: -6 }); // net::ERR_FILE_NOT_FOUND
      }
    });

    app.setAsDefaultProtocolClient('app');
    console.log('Protocol registration complete');
  } catch (error) {
    console.error('Error registering protocol:', error);
  }
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

// Function to create window
function createWindow() {
  try {
    console.log('Creating window with __dirname:', __dirname);
    console.log('App path:', app.getAppPath());
    
    mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: join(__dirname, 'preload.js')
      }
    });

    if (process.env.NODE_ENV === 'development') {
      console.log('Loading app in development mode');
      mainWindow.loadURL('http://localhost:5173');
      mainWindow.webContents.openDevTools();
    } else {
      console.log('Loading app in production mode');
      
      const indexPath = join(__dirname, '..', 'dist', 'index.html');
      console.log('Loading index.html from:', indexPath);
      
      if (!existsSync(indexPath)) {
        throw new Error(`index.html not found at ${indexPath}`);
      }

      mainWindow.loadURL('app://./index.html');
    }

    // Debug IPC setup
    mainWindow.webContents.on('did-finish-load', () => {
      console.log('Window loaded, IPC should be available');
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });
  } catch (error) {
    console.error('Error in createWindow:', error);
    throw error;
  }
}

// Initialize app
app.whenReady().then(() => {
  try {
    console.log('App is ready');
    
    // Load environment variables (keep for backward compatibility)
    ENV = loadEnvVars();
    
    // Register protocol handler first
    if (process.env.NODE_ENV !== 'development') {
      registerProtocol();
    }
    
    // Create OAuth server
    createOAuthServer();
    
    // Create main window last
    createWindow();
    
    // Handle IPC messages
    ipcMain.handle('oauth-logout', async (event, { token, clientId, clientSecret }) => {
      try {
        console.log('Handling logout request');
        
        if (!token || !clientId || !clientSecret) {
          console.log('Missing required parameters for logout');
          return { success: true }; // Still return success to allow UI cleanup
        }

        try {
          // Call GitHub's token revocation endpoint
          await axios.delete(`https://api.github.com/applications/${clientId}/grant`, {
            auth: {
              username: clientId,
              password: clientSecret
            },
            data: {
              access_token: token
            }
          });
        } catch (error) {
          // Log error but don't throw - we still want to clear local state
          console.error('GitHub API error during logout:', error.message);
        }
        
        return { success: true };
      } catch (error) {
        console.error('Error in logout handler:', error);
        return { success: true }; // Still return success to allow UI cleanup
      }
    });
    
    ipcMain.on('open-oauth-window', (event, { url, credentials }) => {
      try {
        console.log('Received open-oauth-window request');
        console.log('OAuth URL:', url);
        
        if (!url) {
          console.error('No URL provided for OAuth window');
          event.reply('app-error', {
            type: 'oauth-error',
            error: 'No URL provided'
          });
          return;
        }

        // Store credentials for later use
        currentCredentials = credentials;

        // Create a new window for OAuth
        authWindow = new BrowserWindow({
          width: 800,
          height: 600,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
          }
        });

        // Handle window close
        authWindow.webContents.on('did-finish-load', () => {
          console.log('OAuth window loaded:', authWindow.webContents.getURL());
          // If the URL contains our callback URL, let it process normally
          if (authWindow.webContents.getURL().startsWith('http://localhost:8788/auth/callback')) {
            console.log('On callback URL, letting it process');
            return;
          }
        });

        // Handle window close
        authWindow.on('closed', () => {
          console.log('OAuth window closed');
          // Clean up
          if (currentCredentials) {
            currentCredentials = null;
          }
        });

        console.log('Loading OAuth URL in window:', url);
        authWindow.loadURL(url);
      } catch (error) {
        console.error('Error opening OAuth window:', error);
        event.reply('app-error', {
          type: 'oauth-window-error',
          error: error.message
        });
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
require('electron').ipcMain.on('app-ready', () => {
  console.log('Renderer process reported ready');
});

require('electron').ipcMain.on('auth-error', (event, error) => {
  console.error('Authentication error from renderer:', error);
});

// Handle errors
process.on('uncaughtException', (error) => {
  handleError(error, 'Uncaught Exception');
});

process.on('unhandledRejection', (error) => {
  handleError(error, 'Unhandled Rejection');
});
