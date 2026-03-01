import sharp from 'sharp';
import path from 'path';

const TROPHY_IMAGE_PATH = path.join(process.cwd(), 'public/botillo - trofeillo.jpg');

export async function generateWinnerImage(winnerName: string): Promise<Buffer> {
  const image = sharp(TROPHY_IMAGE_PATH);
  const metadata = await image.metadata();
  
  const text = winnerName.length > 15 ? winnerName.substring(0, 12) + '...' : winnerName;
  
  const svgText = `
    <svg width="${metadata.width}" height="${metadata.height}">
      <rect x="490" y="265" width="190" height="50" rx="10" fill="black" transform="rotate(-5, 500, 245)" />
      <text x="580" y="300" font-family="Arial" font-size="36" font-weight="bold" fill="white" text-anchor="middle" transform="rotate(-5, 500, 245)">${text}</text>
    </svg>
  `;
  
  return await image
    .composite([{
      input: Buffer.from(svgText),
      top: 0,
      left: 0
    }])
    .jpeg()
    .toBuffer();
}
