import { createOAuthAppAuth } from "@octokit/auth-oauth-app";

export async function onRequest(context) {
  try {
    const { env, request } = context;

    // Validate required environment variables
    if (!env.GITHUB_CLIENT_ID) {
      throw new Error('GITHUB_CLIENT_ID environment variable is not set');
    }
    if (!env.BASE_URL) {
      throw new Error('BASE_URL environment variable is not set');
    }

    // Use configurable redirect URI from environment or fallback
    const redirectUri = env.OAUTH_REDIRECT_URI || `${env.BASE_URL}/auth/callback`;

    // Build the GitHub authorization URL
    const params = new URLSearchParams({
      client_id: env.GITHUB_CLIENT_ID,
      redirect_uri: redirectUri,
      scope: 'repo',
      response_type: 'code',
      state: crypto.randomUUID() // Add state parameter for security
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
              // Check if we need to handle a session first
              if (!document.cookie.includes('logged-in=yes')) {
                window.location.href = 'https://github.com/session';
              } else {
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
            // Display minimal debug info on page
            document.getElementById('debug').textContent = 
              'Redirecting to GitHub authentication...';
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
    return new Response(JSON.stringify({ 
      error: error.message,
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