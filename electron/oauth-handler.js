const http = require('http');
const axios = require('axios');
const errorHandler = require('./error-handler');
const configLoader = require('./config-loader');
const windowManager = require('./window-manager');

class OAuthHandler {
    constructor() {
        this.server = null;
        this.showNotification = null;
        this.mainWindow = null;
        this.serverInitialized = false;
        this.config = null;
        this.redirectUri = 'http://localhost:8788/auth/callback';
    }

    initialize(showNotification, mainWindow) {
        this.showNotification = showNotification;
        this.mainWindow = mainWindow;
        
        // Load configuration
        this.config = configLoader.getConfig();
        
        if (!this.config.GITHUB_CLIENT_ID || !this.config.GITHUB_CLIENT_SECRET) {
            throw new Error('GitHub OAuth credentials not found in configuration');
        }

        // Add error listener for OAuth server issues
        errorHandler.addListener((type, data) => {
            if (type === 'oauth-server-error') {
                this.handleOAuthServerError(data);
            }
        });

        console.log('OAuth Handler initialized with redirect URI:', this.redirectUri);
    }

    getAuthUrl() {
        const params = new URLSearchParams({
            client_id: this.config.GITHUB_CLIENT_ID,
            redirect_uri: this.redirectUri,
            scope: 'repo user',  // Add user scope to get repository access
            response_type: 'code'
        });

        return `https://github.com/login/oauth/authorize?${params.toString()}`;
    }

    async createOAuthServer() {
        if (this.server) {
            console.log('OAuth server already exists');
            return;
        }

        return new Promise((resolve, reject) => {
            try {
                this.server = http.createServer(async (req, res) => {
                    try {
                        await this.handleServerRequest(req, res);
                    } catch (error) {
                        errorHandler.handleError(error, 'OAuth Server Request');
                        this.sendErrorResponse(res, error);
                    }
                });

                this.server.on('error', (error) => {
                    if (error.code === 'EADDRINUSE') {
                        console.log('Port 8788 is already in use. Attempting to close existing server...');
                        this.closeServer()
                            .then(() => this.createOAuthServer())
                            .then(resolve)
                            .catch(reject);
                    } else {
                        errorHandler.handleError(error, 'OAuth Server');
                        reject(error);
                    }
                });

                this.server.listen(8788, () => {
                    console.log('OAuth server is running on port 8788');
                    this.serverInitialized = true;
                    resolve();
                });
            } catch (error) {
                errorHandler.handleError(error, 'OAuth Server Creation');
                reject(error);
            }
        });
    }

    async handleServerRequest(req, res) {
        if (!this.serverInitialized) {
            throw new Error('OAuth server not properly initialized');
        }

        const url = new URL(req.url, `http://${req.headers.host}`);
        
        if (url.pathname === '/auth/callback') {
            await this.handleOAuthCallback(req, res);
        } else {
            this.sendErrorResponse(res, new Error('Invalid endpoint'));
        }
    }

    getMainWindow() {
        // Always get the latest main window reference
        return this.mainWindow || windowManager.getMainWindow();
    }

    async handleOAuthCallback(req, res) {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const code = url.searchParams.get('code');

        if (!code) {
            throw new Error('No code provided in callback');
        }

        try {
            console.log('Exchanging code for token...');
            
            // Prepare the token exchange request
            const tokenRequest = {
                client_id: this.config.GITHUB_CLIENT_ID,
                client_secret: this.config.GITHUB_CLIENT_SECRET,
                code: code,
                redirect_uri: this.redirectUri
            };

            console.log('Token request payload:', {
                client_id: tokenRequest.client_id,
                code: tokenRequest.code,
                redirect_uri: tokenRequest.redirect_uri
            });

            // Exchange code for token using the GitHub API
            const response = await axios({
                method: 'POST',
                url: 'https://github.com/login/oauth/access_token',
                headers: {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json'
                },
                data: tokenRequest,
                validateStatus: function (status) {
                    return status >= 200 && status < 500;
                }
            });

            console.log('Token exchange response status:', response.status);
            if (response.data.error) {
                console.error('GitHub OAuth error:', response.data.error_description || response.data.error);
                throw new Error(response.data.error_description || 'Failed to exchange code for token');
            }

            if (!response.data.access_token) {
                throw new Error('No access token received from GitHub');
            }

            // Send success response to the OAuth window
            res.writeHead(200, { 
                'Content-Type': 'text/html',
                'Access-Control-Allow-Origin': '*'
            });
            res.end(`
                <html>
                    <body>
                        <h1>Authentication successful!</h1>
                        <p>You can close this window now.</p>
                        <script>
                            window.close();
                        </script>
                    </body>
                </html>
            `);

            // Get the latest main window reference
            const mainWindow = this.getMainWindow();
            
            // Send token data to main window
            if (mainWindow && !mainWindow.isDestroyed()) {
                console.log('Sending auth data to main window');
                mainWindow.webContents.send('oauth-token', {
                    access_token: response.data.access_token,
                    token_type: response.data.token_type,
                    scope: response.data.scope
                });
            } else {
                console.error('Main window not available for token notification');
            }
        } catch (error) {
            console.error('OAuth callback error:', error.response?.data || error.message);
            errorHandler.handleError(error, 'OAuth Callback');
            
            this.sendErrorResponse(res, error);
            
            const mainWindow = this.getMainWindow();
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('oauth-error', {
                    message: error.message,
                    details: error.response?.data || {}
                });
            }
        }
    }

    handleOAuthServerError(error) {
        console.log('Handling OAuth server error:', error);
        
        // Attempt to restart the server
        this.closeServer()
            .then(() => this.createOAuthServer())
            .catch(error => {
                errorHandler.handleError(error, 'OAuth Server Restart');
            });
    }

    async closeServer() {
        if (this.server) {
            return new Promise((resolve, reject) => {
                this.server.close((error) => {
                    if (error) {
                        reject(error);
                    } else {
                        this.server = null;
                        this.serverInitialized = false;
                        resolve();
                    }
                });
            });
        }
    }

    sendErrorResponse(res, error) {
        const errorResponse = {
            error: error.message || 'Internal Server Error',
            details: error.response?.data || {}
        };

        res.writeHead(500, { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify(errorResponse));
    }
}

module.exports = new OAuthHandler();
