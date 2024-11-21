import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default async function beforePack() {
  console.log('Running beforePack script...');
  
  return new Promise((resolve, reject) => {
    const buildProcess = spawn('npm', ['run', 'build'], {
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        NODE_ENV: 'production',
        ELECTRON: 'true'
      },
      cwd: join(__dirname, '..')
    });

    buildProcess.on('close', (code) => {
      if (code === 0) {
        console.log('Build completed successfully');
        resolve();
      } else {
        console.error(`Build failed with code ${code}`);
        reject(new Error(`Build process exited with code ${code}`));
      }
    });

    buildProcess.on('error', (err) => {
      console.error('Build process error:', err);
      reject(err);
    });
  });
}
