const { createServer } = require('http');
const { parse } = require('url');
const axios = require('axios');

class OAuthHandler {
    constructor() {
        this.oauthServer = null;
        this.isOAuthServerClosed = false;
        this.currentCredentials = null;
    }

    createOAuthServer(showNotification, mainWindow) {
        try {
            if (this.oauthServer) {
                console.log('OAuth server already exists');
                return;
            }

            console.log('Creating OAuth server');
            this.oauthServer = createServer((req, res) => {
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
                        this.handleOAuthCallback(req, res, showNotification, mainWindow);
                    } else if (urlParts.pathname === '/auth/revoke' && req.method === 'POST') {
                        this.handleTokenRevocation(req, res, showNotification);
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
                    this.closeOAuthServer();
                }).on('error', () => {
                    // No server running, which is what we want
                });
            } catch (error) {
                // Ignore errors here
            }

            this.oauthServer.listen(8788, () => {
                console.log('OAuth server is running on port 8788');
            });

            this.oauthServer.on('error', (error) => {
                console.error('OAuth server error:', error);
                if (error.code === 'EADDRINUSE') {
                    console.log('Port is in use, attempting to close existing server');
                    this.closeOAuthServer();
                    setTimeout(() => this.createOAuthServer(showNotification, mainWindow), 1000);
                }
            });
        } catch (error) {
            console.error('Error creating OAuth server:', error);
            showNotification('OAuth Server Error', error.message, 'error');
        }
    }

    closeOAuthServer() {
        if (this.oauthServer && !this.isOAuthServerClosed) {
            console.log('Closing OAuth server');
            this.oauthServer.close(() => {
                console.log('OAuth server closed');
                this.isOAuthServerClosed = true;
            });
        }
    }

    async handleOAuthCallback(req, res, showNotification, mainWindow) {
        const urlParts = parse(req.url, true);
        const { code, error } = urlParts.query;

        if (error) {
            console.error('OAuth error:', error);
            res.writeHead(400);
            res.end(`Authentication error: ${error}`);
            showNotification('Authentication Error', error, 'error');
            return;
        }

        if (!code) {
            console.error('No code received');
            res.writeHead(400);
            res.end('No code received');
            showNotification('Authentication Error', 'No authorization code received', 'error');
            return;
        }

        try {
            const tokenResponse = await axios.post('https://github.com/login/oauth/access_token', {
                client_id: process.env.GITHUB_CLIENT_ID,
                client_secret: process.env.GITHUB_CLIENT_SECRET,
                code
            }, {
                headers: {
                    Accept: 'application/json'
                }
            });

            if (tokenResponse.data.error) {
                throw new Error(tokenResponse.data.error_description || tokenResponse.data.error);
            }

            const { access_token } = tokenResponse.data;

            if (!access_token) {
                throw new Error('No access token received');
            }

            // Get user data
            const userResponse = await axios.get('https://api.github.com/user', {
                headers: {
                    Authorization: `token ${access_token}`
                }
            });

            this.currentCredentials = {
                accessToken: access_token,
                user: userResponse.data
            };

            // Send the credentials to the renderer process
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('oauth-success', this.currentCredentials);
            }

            // Send success response
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
                <html>
                    <body>
                        <h1>Authentication Successful</h1>
                        <p>You can close this window now.</p>
                        <script>window.close()</script>
                    </body>
                </html>
            `);

            showNotification('Authentication Success', 'Successfully authenticated with GitHub');
        } catch (error) {
            console.error('Error exchanging code for token:', error);
            res.writeHead(500);
            res.end('Error exchanging code for token');
            showNotification('Authentication Error', error.message, 'error');
        }
    }

    async handleTokenRevocation(req, res, showNotification) {
        try {
            if (!this.currentCredentials || !this.currentCredentials.accessToken) {
                throw new Error('No active session to revoke');
            }

            // Revoke the token
            await axios.delete(`https://api.github.com/applications/${process.env.GITHUB_CLIENT_ID}/token`, {
                auth: {
                    username: process.env.GITHUB_CLIENT_ID,
                    password: process.env.GITHUB_CLIENT_SECRET
                },
                data: {
                    access_token: this.currentCredentials.accessToken
                }
            });

            this.currentCredentials = null;
            res.writeHead(200);
            res.end('Token revoked successfully');
            showNotification('Logout Success', 'Successfully logged out from GitHub');
        } catch (error) {
            console.error('Error revoking token:', error);
            res.writeHead(500);
            res.end('Error revoking token');
            showNotification('Logout Error', error.message, 'error');
        }
    }

    getCurrentCredentials() {
        return this.currentCredentials;
    }
}

module.exports = new OAuthHandler();
