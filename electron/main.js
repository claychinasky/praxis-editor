const { app, BrowserWindow, protocol, Notification } = require('electron');
const { join, dirname } = require('path');
const { existsSync } = require('fs');
const oauthHandler = require('./oauth-handler');
const windowManager = require('./window-manager');
const configLoader = require('./config-loader');
const ipcHandler = require('./ipc-handler');
const errorHandler = require('./error-handler');

let forceQuit = false;

// Register protocol schemes before app is ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { secure: true, standard: true } }
]);

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
    protocol.registerFileProtocol('app', (request, callback) => {
      try {
        const url = request.url.substring(6); // Remove 'app://' from the URL
        console.log('App protocol request:', request.url);
        console.log('Parsed URL:', url);

        let filePath;
        if (process.env.NODE_ENV === 'development') {
          // In development, serve from the dist directory
          filePath = join(__dirname, '../dist', url);
        } else {
          // In production, serve from the dist directory inside app.asar
          filePath = join(__dirname, '../dist', url);
          
          // If file doesn't exist in electron/dist, try the root dist directory
          if (!existsSync(filePath)) {
            filePath = join(app.getAppPath(), 'dist', url);
          }
        }
        console.log('Resolved file path:', filePath);

        // Check if file exists
        if (!existsSync(filePath)) {
          console.error('File not found:', filePath);
          // Try index.html for SPA routing
          if (!url.includes('.')) {
            const indexPath = join(dirname(filePath), 'index.html');
            if (existsSync(indexPath)) {
              console.log('Serving index.html for SPA route');
              callback({ path: indexPath });
              return;
            }
          }
          callback({ error: -6 }); // FILE_NOT_FOUND
          return;
        }

        callback({ path: filePath });
      } catch (error) {
        console.error('Protocol handler error:', error);
        callback({ error: -2 }); // FAILED
      }
    });

    console.log('App protocol registered successfully');
  } catch (error) {
    errorHandler.handleError(error, 'Protocol Registration');
  }
}

// Initialize app
app.whenReady().then(async () => {
  try {
    console.log('App is ready');
    console.log('App path:', app.getAppPath());
    console.log('Current directory:', __dirname);
    
    // Load environment variables first
    await configLoader.loadEnvVars();
    
    // Initialize error handler
    errorHandler.initialize(showNotification);
    
    // Register protocol handler before creating windows
    registerProtocol();
    
    // Create main window first
    await createWindow();
    
    // Initialize OAuth handler after window is created
    oauthHandler.initialize(showNotification, windowManager.getMainWindow());
    
    // Create OAuth server
    await oauthHandler.createOAuthServer();
    
    // Initialize IPC handlers last
    ipcHandler.initialize(windowManager, showNotification);
    
    app.on('activate', () => {
      if (!windowManager.getMainWindow()) {
        createWindow();
      }
    });
    
  } catch (error) {
    errorHandler.handleError(error, 'Initialization');
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
  oauthHandler.closeServer();
});

// Handle macOS dock click
app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    try {
      await createWindow();
    } catch (error) {
      errorHandler.handleError(error, 'Window Creation');
    }
  }
});

// Handle errors
process.on('uncaughtException', (error) => {
  errorHandler.handleError(error, 'Uncaught Exception');
});

process.on('unhandledRejection', (error) => {
  errorHandler.handleError(error, 'Unhandled Rejection');
});
