const { ipcMain } = require('electron');
const axios = require('axios');
const oauthHandler = require('./oauth-handler');

class IPCHandler {
    constructor() {
        this.currentCredentials = null;
    }

    initialize(windowManager, showNotification) {
        // Handle OAuth logout
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

        // Handle OAuth token received
        ipcMain.on('oauth-token-received', (event, data) => {
            console.log('OAuth token received in IPC handler');
            if (data.nextRoute) {
                windowManager.getMainWindow().webContents.send('route-to', data.nextRoute);
            }
        });

        // Handle repository selection
        ipcMain.on('repository-selected', (event, repository) => {
            console.log('Repository selected:', repository.full_name);
            windowManager.getMainWindow().webContents.send('route-to', '/editor');
        });

        // Handle OAuth window opening
        ipcMain.on('open-oauth-window', (event, credentials) => {
            try {
                console.log('Received open-oauth-window request');
                
                // Get the OAuth URL from the OAuth handler
                const url = oauthHandler.getAuthUrl();
                console.log('OAuth URL:', url);

                // Store credentials for later use
                this.currentCredentials = credentials;

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
                    if (this.currentCredentials) {
                        this.currentCredentials = null;
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

        // Handle app ready event
        ipcMain.on('app-ready', () => {
            console.log('Renderer process reported ready');
        });

        // Handle auth errors
        ipcMain.on('auth-error', (event, error) => {
            console.error('Authentication error from renderer:', error);
            showNotification('Authentication Error', error.message || 'Authentication failed', 'error');
        });
    }

    getCurrentCredentials() {
        return this.currentCredentials;
    }

    setCurrentCredentials(credentials) {
        this.currentCredentials = credentials;
    }
}

module.exports = new IPCHandler();
