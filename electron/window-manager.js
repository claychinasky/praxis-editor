const { BrowserWindow } = require('electron');
const { join, dirname } = require('path');
const { existsSync } = require('fs');

class WindowManager {
    constructor() {
        this.mainWindow = null;
        this.authWindow = null;
        this.forceQuit = false;
    }

    createMainWindow(preloadPath) {
        try {
            console.log('Creating window with __dirname:', __dirname);
            
            this.mainWindow = new BrowserWindow({
                width: 1200,
                height: 800,
                webPreferences: {
                    nodeIntegration: false,
                    contextIsolation: true,
                    preload: preloadPath
                }
            });

            if (process.env.NODE_ENV === 'development') {
                console.log('Loading app in development mode');
                this.mainWindow.loadURL('http://localhost:5173');
                this.mainWindow.webContents.openDevTools();
            } else {
                console.log('Loading app in production mode');
                
                const indexPath = join(__dirname, '..', 'dist', 'index.html');
                console.log('Loading index.html from:', indexPath);
                
                if (!existsSync(indexPath)) {
                    throw new Error(`index.html not found at ${indexPath}`);
                }

                this.mainWindow.loadURL('app://./index.html');
            }

            // Debug IPC setup
            this.mainWindow.webContents.on('did-finish-load', () => {
                console.log('Window loaded, IPC should be available');
            });

            this.mainWindow.on('closed', () => {
                this.mainWindow = null;
            });

            return this.mainWindow;
        } catch (error) {
            console.error('Error in createWindow:', error);
            throw error;
        }
    }

    createAuthWindow(url) {
        this.authWindow = new BrowserWindow({
            width: 800,
            height: 600,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true
            }
        });

        this.authWindow.loadURL(url);
        return this.authWindow;
    }

    getMainWindow() {
        return this.mainWindow;
    }

    getAuthWindow() {
        return this.authWindow;
    }

    closeAuthWindow() {
        if (this.authWindow && !this.authWindow.isDestroyed()) {
            this.authWindow.close();
        }
        this.authWindow = null;
    }

    setForceQuit(value) {
        this.forceQuit = value;
    }

    isForceQuit() {
        return this.forceQuit;
    }
}

module.exports = new WindowManager();
