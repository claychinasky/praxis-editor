const { readFileSync, existsSync } = require('fs');
const { join, dirname } = require('path');
const { app } = require('electron');

function loadEnvVars() {
    const appPath = app.getAppPath();
    const appDir = dirname(appPath);
    
    // Define paths relative to the app directory
    const envPaths = [
        join(appDir, '..', '.dev.vars'),
        join(appDir, '.dev.vars'),
        join(__dirname, '.dev.vars'),
        join(process.cwd(), '.dev.vars')
    ];

    let vars = {};
    for (const path of envPaths) {
        try {
            console.log('Checking for env file at:', path);
            if (existsSync(path)) {
                console.log('Found env file at:', path);
                const content = readFileSync(path, 'utf8');
                const lines = content.split('\n').filter(line => line.trim());
                for (const line of lines) {
                    // Split on first = only
                    const [key, ...valueParts] = line.split('=');
                    const value = valueParts.join('='); // Rejoin in case value contains =
                    if (key && value) {
                        const trimmedKey = key.trim();
                        // Remove quotes and spaces from value
                        const trimmedValue = value.trim().replace(/^["']|["']$/g, '');
                        vars[trimmedKey] = trimmedValue;
                        if (trimmedKey !== 'GITHUB_CLIENT_SECRET') {
                            console.log(`Loaded ${trimmedKey}:`, trimmedValue);
                        }
                    }
                }
                console.log('All variables loaded:', Object.keys(vars));
                break;
            }
        } catch (error) {
            console.error(`Error loading env file ${path}:`, error);
        }
    }

    // Ensure all required variables are present
    const config = {
        GITHUB_CLIENT_ID: vars.GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID || '',
        GITHUB_CLIENT_SECRET: vars.GITHUB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET || '',
        GITHUB_REPO: vars.GITHUB_REPO || process.env.GITHUB_REPO || ''
    };

    // Log loaded configuration (excluding sensitive data)
    console.log('Final config:', {
        GITHUB_CLIENT_ID: config.GITHUB_CLIENT_ID,
        GITHUB_REPO: config.GITHUB_REPO,
        GITHUB_CLIENT_SECRET: '[REDACTED]'
    });

    return config;
}

// Export both functions
module.exports = {
    loadEnvVars,
    getConfig: () => ({
        GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || '',
        GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || '',
        GITHUB_REPO: process.env.GITHUB_REPO || ''
    })
};
