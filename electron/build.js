import { copyFileSync, mkdirSync, existsSync, readFileSync, writeFileSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

console.log('\n=== Starting build process ===');
console.log('Build timestamp:', new Date().toISOString());

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get the project root directory
const rootDir = dirname(__dirname);
console.log('Root directory:', rootDir);

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
console.log('\nCopying electron files...');
const electronFiles = ['main.js', 'config.js', 'preload.js'];
for (const file of electronFiles) {
    const src = join(__dirname, file);
    const dest = join(electronDir, file);
    if (existsSync(src)) {
        copyFileSync(src, dest);
        console.log(`Copied ${file}`);
    } else {
        console.warn(`Warning: ${file} not found at ${src}`);
    }
}

// Verify critical files
console.log('\nVerifying critical files...');
const criticalFiles = ['main.js', 'preload.js', 'config.js'];
for (const file of criticalFiles) {
    const filePath = join(electronDir, file);
    if (existsSync(filePath)) {
        const stats = readFileSync(filePath, 'utf8');
        console.log(`${file} exists and is ${stats.length} bytes`);
    } else {
        console.error(`Error: Critical file ${file} is missing from ${filePath}`);
    }
}

// Copy .dev.vars file
const devVarsPath = join(rootDir, '.dev.vars');
if (existsSync(devVarsPath)) {
    const destDevVars = join(appDir, '.dev.vars');
    copyFileSync(devVarsPath, destDevVars);
    console.log('Copied .dev.vars');
}

console.log('\nBuild preparation complete!');
