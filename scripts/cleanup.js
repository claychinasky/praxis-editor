import { rm } from 'fs/promises';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const projectRoot = join(__dirname, '..');
const distPath = join(projectRoot, 'electron-dist');

async function cleanup() {
    try {
        console.log('Cleaning up previous build...');
        await rm(distPath, { recursive: true, force: true });
        console.log('Cleanup complete!');
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error('Error during cleanup:', err);
        }
    }
}

cleanup();
