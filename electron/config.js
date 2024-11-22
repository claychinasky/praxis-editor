const { readFileSync, existsSync } = require('fs');
const { join, dirname } = require('path');

function loadEnvVars() {
    const envPaths = [
        '.dev.vars',
        '.env',
        '../.dev.vars',
        '../.env',
    ];

    let vars = {};
    for (const path of envPaths) {
        try {
            if (existsSync(path)) {
                const content = readFileSync(path, 'utf8');
                const lines = content.split('\n');
                for (const line of lines) {
                    const [key, value] = line.split('=').map(s => s.trim());
                    if (key && value) {
                        // Remove quotes if present
                        vars[key] = value.replace(/^["']|["']$/g, '');
                    }
                }
                break;
            }
        } catch (error) {
            console.error(`Error loading env file ${path}:`, error);
        }
    }

    return {
        GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || vars.GITHUB_CLIENT_ID || '',
        GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || vars.GITHUB_CLIENT_SECRET || ''
    };
}

// Export the function instead of its result
module.exports = {
    loadEnvVars,
    getConfig: () => ({
        GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID || '',
        GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET || ''
    })
};
