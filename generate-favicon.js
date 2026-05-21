const sharp = require('sharp');
const path = require('path');

const inputPath = path.join(__dirname, 'public', 'nesr-logo.jpg');
const outputPath = path.join(__dirname, 'public', 'nesr-logo-circle.png');

async function makeCircle() {
  const image = sharp(inputPath);
  const metadata = await image.metadata();
  const size = Math.min(metadata.width, metadata.height);

  const circleSvg = `
    <svg width="${size}" height="${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" />
    </svg>
  `;

  await image
    .resize(size, size, { fit: 'cover' })
    .composite([{
      input: Buffer.from(circleSvg),
      blend: 'dest-in'
    }])
    .png()
    .toFile(outputPath);
  
  console.log('Circular favicon generated successfully!');
}

makeCircle().catch(console.error);

// Hi its carlos
