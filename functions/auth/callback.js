import axios from 'axios';
import { createOAuthAppAuth } from "@octokit/auth-oauth-app";

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*', // Allow all origins in Electron
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  
  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new Response(null, { 
      status: 204,
      headers: corsHeaders
    });
  }
  
  if (url.searchParams.has('code')) {
    try {
      const code = url.searchParams.get('code');
      console.log('Starting token exchange with code:', code);

      // Use configurable redirect URI from environment
      const redirectUri = env.OAUTH_REDIRECT_URI || `${env.BASE_URL}/auth/callback`;

      // Debug: Log request details
      console.log('Callback Request Details:', {
        url: request.url,
        headers: Object.fromEntries(request.headers),
        redirectUri,
        code,
        state: url.searchParams.get('state')
      });

      // Prepare the request
      const tokenEndpoint = 'https://github.com/login/oauth/access_token';
      const params = new URLSearchParams({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code: code,
        redirect_uri: redirectUri
      });

      console.log('Token exchange debug:', {
        clientId: env.GITHUB_CLIENT_ID,
        redirectUri: redirectUri,
        code: code,
        tokenEndpoint: tokenEndpoint
      });

      // Make the request using axios
      const response = await axios({
        method: 'post',
        url: tokenEndpoint,
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'Pages-CMS/1.0'
        },
        data: params.toString(),
        validateStatus: null // Don't throw on any status code
      });

      console.log('Token exchange response:', {
        status: response.status,
        statusText: response.statusText,
        data: response.data ? { ...response.data, access_token: '[REDACTED]' } : null
      });

      if (response.status !== 200 || !response.data.access_token) {
        throw new Error('Failed to exchange code for token: ' + JSON.stringify(response.data));
      }

      // Return a page that will pass the token to the app
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Authentication Successful</title>
            <script>
              function redirectWithToken() {
                const token = ${JSON.stringify(response.data.access_token)};
                const isElectron = window.navigator.userAgent.includes('Electron');
                const protocol = window.location.protocol;
                
                // Always redirect to app root with token
                const redirectUrl = '/?access_token=' + encodeURIComponent(token);
                window.location.href = redirectUrl;
              }
              
              // Execute redirect when the page loads
              window.onload = redirectWithToken;
            </script>
          </head>
          <body>
            <p>Authentication successful! Redirecting back to the app...</p>
          </body>
        </html>
      `;

      return new Response(html, {
        headers: {
          'Content-Type': 'text/html',
          ...corsHeaders
        }
      });

    } catch (error) {
      console.error('Token exchange error:', error);
      return new Response(JSON.stringify({
        error: 'Failed to exchange code for token',
        details: error.message
      }), { 
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders
        }
      });
    }
  }

  return new Response('No code provided', {
    status: 400,
    headers: {
      'Content-Type': 'text/plain',
      ...corsHeaders
    }
  });
}
