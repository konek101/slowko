import { generateShareImageFast as generateShareImage } from './boardpng.js';
import { writeFile } from 'fs/promises';
import fs from 'fs';
import path from 'path';

async function main() {
  const state = [
    ['⬛','⬛','⬛','🟩','⬛'],
    ['🟨','⬛','⬛','🟨','⬛'],
    ['⬛','⬛','🟨','🟨','⬛'],
    ['🟨','⬛','⬛','🟩','⬛'],
    ['🟩','🟩','🟩','🟩','🟩'],
    ['🔳','🔳','🔳','🔳','🔳']
  ];

  // Prefer bundled font in server/fonts
  const fontsDir = path.join(process.cwd(), 'fonts');
  let fontPath;
  try {
    const files = fs.readdirSync(fontsDir).filter(n => n.toLowerCase().endsWith('.ttf'));
    if (files.length) fontPath = path.join(fontsDir, files[0]);
  } catch {}

  const players = [
    { state },
    { state },
    { state }
  ];

  const buf = await generateShareImage(players, 1516, { fontPath, headerText: 'Wordle No. 1516' });
  await writeFile('share-multi.png', buf);
  console.log('wrote share-multi.png', buf.length);
}

main().catch(e => {
  console.error('Failed to generate multi share image:', e && e.stack || e);
  process.exit(1);
});
