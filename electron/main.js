const { app, BrowserWindow, ipcMain, protocol, Notification, shell } = require('electron');
const { join, resolve, dirname } = require('path');
const { readFileSync, existsSync } = require('fs');
const { parse } = require('url');
const axios = require('axios');
const vm = require('vm');
const oauthHandler = require('./oauth-handler');
const windowManager = require('./window-manager');

let forceQuit = false;
let ENV = null;
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
  if (windowManager.getMainWindow() && !windowManager.getMainWindow().isDestroyed()) {
    windowManager.getMainWindow().webContents.send('app-notification', { title, body, type });
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

// Function to safely close OAuth server
function closeOAuthServer() {
  oauthHandler.closeOAuthServer();
}

// Function to create window
function createWindow() {
  return windowManager.createMainWindow(join(__dirname, 'preload.js'));
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
          oauthHandler.handleOAuthCallback(request, {
            writeHead: (status, headers) => {
              console.log('OAuth callback response:', status, headers);
            },
            end: (content) => {
              console.log('OAuth callback complete:', content);
            }
          }, showNotification, windowManager.getMainWindow());
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
    oauthHandler.createOAuthServer(showNotification, windowManager.getMainWindow());
    
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
        const authWindow = windowManager.createAuthWindow(url);

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
      } catch (error) {
        console.error('Error opening OAuth window:', error);
        event.reply('app-error', {
          type: 'oauth-window-error',
          error: error.message
        });
      }
    });
    
    app.on('activate', () => {
      if (!windowManager.getMainWindow()) {
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
  windowManager.setForceQuit(true);
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
