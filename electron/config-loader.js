const { join, dirname } = require('path');
const { readFileSync, existsSync } = require('fs');
const vm = require('vm');
const { app } = require('electron');

class ConfigLoader {
    constructor() {
        this.ENV = null;
    }

    loadEnvVars() {
        const isDev = process.env.NODE_ENV === 'development';
        const appPath = app.getAppPath();
        console.log('App path:', appPath);
        console.log('Development mode:', isDev);
        console.log('Current directory:', __dirname);
        console.log('App directory:', dirname(appPath));

        // Check for config in the app's root directory
        const possiblePaths = [
            join(dirname(appPath), 'app', 'electron', 'config.js'),
            join(appPath, 'electron', 'config.js'),
            join(__dirname, 'config.js'),
            join(dirname(appPath), '..', '.dev.vars'),  // Check one level up
            join(dirname(appPath), '.dev.vars'),
            join(appPath, '.dev.vars'),
            join(__dirname, '.dev.vars')
        ];
        
        console.log('Checking possible config paths:', JSON.stringify(possiblePaths, null, 2));
        
        let config = null;
        let errors = [];
        
        for (const path of possiblePaths) {
            try {
                console.log('Checking config path:', path);
                if (existsSync(path)) {
                    console.log('Found config at:', path);
                    
                    if (path.endsWith('.dev.vars')) {
                        const content = readFileSync(path, 'utf8');
                        const vars = {};
                        content.split('\n').forEach(line => {
                            const [key, value] = line.split('=').map(s => s.trim());
                            if (key && value) {
                                vars[key] = value.replace(/^["']|["']$/g, '');
                            }
                        });
                        config = {
                            GITHUB_CLIENT_ID: vars.GITHUB_CLIENT_ID || '',
                            GITHUB_CLIENT_SECRET: vars.GITHUB_CLIENT_SECRET || ''
                        };
                    } else {
                        const configContent = readFileSync(path, 'utf8');
                        console.log('Config content length:', configContent.length);
                        
                        if (!configContent || configContent.length < 10) {
                            const error = `Config file at ${path} is empty or invalid`;
                            console.error(error);
                            errors.push(error);
                            continue;
                        }
                        
                        const context = { 
                            module: { exports: {} }, 
                            exports: {},
                            require,
                            console,
                            __dirname,
                            __filename: path,
                            process
                        };
                        
                        vm.runInNewContext(configContent, context);
                        const configModule = context.module.exports;
                        config = configModule.loadEnvVars ? configModule.loadEnvVars() : configModule.getConfig();
                        
                        console.log('Parsed config:', { ...config, GITHUB_CLIENT_SECRET: '[REDACTED]' });
                        
                        if (!config || !config.GITHUB_CLIENT_ID || !config.GITHUB_CLIENT_SECRET) {
                            const error = `Config at ${path} is missing required fields`;
                            console.error(error);
                            errors.push(error);
                            continue;
                        }
                        
                        console.log('Successfully loaded config from:', path);
                        break;
                    }
                } else {
                    console.log('Config file does not exist at:', path);
                }
            } catch (error) {
                const errorMsg = `Error loading config from ${path}: ${error.message}`;
                console.error(errorMsg);
                errors.push(errorMsg);
            }
        }
        
        if (!config) {
            console.error('All config loading attempts failed. Errors:', errors);
            throw new Error(`Failed to load config from any location. Errors:\n${errors.join('\n')}`);
        }
        
        this.ENV = config;
        return config;
    }

    getConfig() {
        return this.ENV;
    }
}

module.exports = new ConfigLoader();
