import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { setTimeout } from 'timers/promises';
import fs from 'fs/promises';
import * as processModule from 'process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, args, {
      ...options,
      stdio: 'inherit',
      env: {
        ...processModule.env,
        ...options.env,
      }
    });
    
    childProcess.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Process exited with code ${code}`));
      }
    });

    childProcess.on('error', (err) => {
      reject(err);
    });
  });
}

async function copyEnvVars() {
  try {
    const devVars = await fs.readFile('.dev.vars', 'utf-8');
    const vars = Object.fromEntries(
      devVars.split('\n')
        .filter(line => line.trim() && !line.startsWith('#'))
        .map(line => line.split('='))
    );
    
    // Create a temporary wrangler.toml with the environment variables
    const wranglerConfig = `
[vars]
BASE_URL = "${vars.BASE_URL || ''}"
GITHUB_CLIENT_ID = "${vars.GITHUB_CLIENT_ID || ''}"
GITHUB_CLIENT_SECRET = "${vars.GITHUB_CLIENT_SECRET || ''}"
    `.trim();
    
    await fs.writeFile('wrangler.toml', wranglerConfig);
    return vars;
  } catch (error) {
    console.error('Error copying environment variables:', error);
    throw error;
  }
}

async function build() {
  try {
    // Copy environment variables
    console.log('Setting up environment...');
    await copyEnvVars();

    // Build the site statically
    console.log('Building site...');
    await runCommand('npm', ['run', 'build'], {
      shell: true,
      env: {
        NODE_ENV: 'production',
        ELECTRON: 'true'
      }
    });

    // Build Electron app
    console.log('Building Electron app...');
    await runCommand('electron-builder', [], {
      shell: true,
      env: {
        NODE_ENV: 'production',
        ELECTRON: 'true'
      }
    });

    // Clean up
    try {
      await fs.unlink('wrangler.toml');
    } catch (error) {
      console.warn('Warning: Could not clean up wrangler.toml');
    }

    console.log('Build completed successfully!');
    processModule.exit(0);
  } catch (error) {
    console.error('Build failed:', error);
    processModule.exit(1);
  }
}

build();
