import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get the project root directory
const rootDir = dirname(__dirname);

// Setup build directories
const buildDir = join(rootDir, 'electron-dist');
const appDir = join(buildDir, 'app');
const electronDir = join(appDir, 'electron');

// Create build directories if they don't exist
if (!existsSync(buildDir)) {
    mkdirSync(buildDir, { recursive: true });
}
if (!existsSync(appDir)) {
    mkdirSync(appDir, { recursive: true });
}
if (!existsSync(electronDir)) {
    mkdirSync(electronDir, { recursive: true });
}

// Copy electron files
const electronFiles = ['main.js', 'config.js', 'preload.js'];
let errors = [];

for (const file of electronFiles) {
    const src = join(__dirname, file);
    const dest = join(electronDir, file);
    try {
        if (existsSync(src)) {
            copyFileSync(src, dest);
        } else {
            errors.push(`${file} not found at ${src}`);
        }
    } catch (error) {
        errors.push(`Failed to copy ${file}: ${error.message}`);
    }
}

// Verify critical files
const criticalFiles = ['main.js', 'preload.js', 'config.js'];
for (const file of criticalFiles) {
    const filePath = join(electronDir, file);
    if (!existsSync(filePath)) {
        errors.push(`Critical file ${file} is missing from ${filePath}`);
    }
}

// Copy .dev.vars file
const devVarsPath = join(rootDir, '.dev.vars');
if (existsSync(devVarsPath)) {
    try {
        const destDevVars = join(appDir, '.dev.vars');
        copyFileSync(devVarsPath, destDevVars);
    } catch (error) {
        errors.push(`Failed to copy .dev.vars: ${error.message}`);
    }
}

if (errors.length > 0) {
    throw new Error('Build failed:\n' + errors.join('\n'));
}
