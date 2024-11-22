import { createOAuthAppAuth } from "@octokit/auth-oauth-app";

export async function onRequest(context) {
  try {
    const { env, request } = context;
    
    // Debug: Log request info
    console.log('Request URL:', request.url);
    console.log('Request Headers:', Object.fromEntries(request.headers));
    console.log('Environment:', {
      GITHUB_CLIENT_ID: env.GITHUB_CLIENT_ID,
      BASE_URL: env.BASE_URL
    });

    // Validate required environment variables
    if (!env.GITHUB_CLIENT_ID) {
      throw new Error('GITHUB_CLIENT_ID environment variable is not set');
    }
    if (!env.BASE_URL) {
      throw new Error('BASE_URL environment variable is not set');
    }

    // Use configurable redirect URI from environment or fallback
    const redirectUri = env.OAUTH_REDIRECT_URI || `${env.BASE_URL}/auth/callback`;
    
    // Debug: Log environment and configuration
    console.log('OAuth Configuration:', {
      redirectUri,
      baseUrl: env.BASE_URL,
      userAgent: request.headers.get('user-agent'),
      origin: request.headers.get('origin'),
      host: request.headers.get('host')
    });

    // Build the GitHub authorization URL
    const params = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: 'repo',
      response_type: 'code',
      state: crypto.randomUUID() // Add state parameter for security
    });

    // Debug: Log all parameters
    console.log('OAuth Parameters:', {
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: 'repo',
      response_type: 'code',
      state: params.get('state'),
      full_url: `https://github.com/login/oauth/authorize?${params.toString()}`
    });

    const authUrl = `https://github.com/login/oauth/authorize?${params}`;

    // Return HTML that will handle the redirect
    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Redirecting to GitHub...</title>
          <script>
            function handleRedirect() {
              // Debug: Log current state
              console.log('Current location:', window.location.href);
              console.log('User Agent:', window.navigator.userAgent);
              console.log('Protocol:', window.location.protocol);

              // Check if we need to handle a session first
              if (!document.cookie.includes('logged-in=yes')) {
                console.log('No GitHub session, redirecting to session endpoint');
                window.location.href = 'https://github.com/session';
              } else {
                console.log('GitHub session exists, redirecting to OAuth');
                window.location.href = ${JSON.stringify(authUrl)};
              }
            }
            window.onload = handleRedirect;
          </script>
        </head>
        <body>
          <p>Redirecting to GitHub login...</p>
          <pre id="debug"></pre>
          <script>
            // Display debug info on page
            document.getElementById('debug').textContent = 
              'Debug Info:\\n' +
              'Location: ' + window.location.href + '\\n' +
              'Protocol: ' + window.location.protocol + '\\n' +
              'OAuth URL: ' + ${JSON.stringify(authUrl)};
          </script>
        </body>
      </html>
    `;

    return new Response(html, {
      headers: {
        'Content-Type': 'text/html',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return new Response(JSON.stringify({ 
      error: error.message,
      stack: error.stack,
      type: error.constructor.name
    }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
}