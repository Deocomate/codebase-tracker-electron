/* eslint-disable @typescript-eslint/no-require-imports */
const pngToIco = require('png-to-ico').default;
const fs = require('fs');
const path = require('path');

async function convertPngToIco() {
  const inputPath = path.join(__dirname, 'resources', 'icon.png');
  const outputPath = path.join(__dirname, 'resources', 'icon.ico');

  try {
    // Convert PNG to ICO with multiple sizes including 256x256
    const buf = await pngToIco(inputPath);
    fs.writeFileSync(outputPath, buf);
    
    console.log('✓ Successfully created icon.ico (256x256)');
  } catch (error) {
    console.error('✗ Error converting icon:', error.message);
    process.exit(1);
  }
}

convertPngToIco();
