import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function createIcon() {
  const sizes = [16, 32, 48, 64, 128, 256];
  const svgBuffer = fs.readFileSync(join(__dirname, '../public/icon.svg'));
  
  const pngBuffers = await Promise.all(
    sizes.map(size => 
      sharp(svgBuffer)
        .resize(size, size, {
          kernel: sharp.kernel.lanczos3,
          fit: 'contain',
          background: { r: 0, g: 0, b: 0, alpha: 0 }
        })
        .png()
        .toBuffer()
    )
  );

  // Create ICO header
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // Reserved
  header.writeUInt16LE(1, 2); // ICO type
  header.writeUInt16LE(sizes.length, 4); // Number of images

  // Create directory entries
  const entries = Buffer.alloc(16 * sizes.length);
  let offset = header.length + entries.length;

  for (let i = 0; i < sizes.length; i++) {
    const size = sizes[i];
    const buffer = pngBuffers[i];
    
    entries.writeUInt8(size === 256 ? 0 : size, i * 16); // Width
    entries.writeUInt8(size === 256 ? 0 : size, i * 16 + 1); // Height
    entries.writeUInt8(0, i * 16 + 2); // Color palette
    entries.writeUInt8(0, i * 16 + 3); // Reserved
    entries.writeUInt16LE(1, i * 16 + 4); // Color planes
    entries.writeUInt16LE(32, i * 16 + 6); // Bits per pixel
    entries.writeUInt32LE(buffer.length, i * 16 + 8); // Image size
    entries.writeUInt32LE(offset, i * 16 + 12); // Image offset
    
    offset += buffer.length;
  }

  // Combine all buffers
  const ico = Buffer.concat([
    header,
    entries,
    ...pngBuffers
  ]);

  fs.writeFileSync(join(__dirname, '../public/icon.ico'), ico);
  console.log('Icon created successfully!');

  // Also save the 256x256 PNG separately
  await sharp(svgBuffer)
    .resize(256, 256, {
      kernel: sharp.kernel.lanczos3,
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(join(__dirname, '../public/icon.png'));
  
  console.log('PNG icon also created!');
}

createIcon().catch(console.error);
