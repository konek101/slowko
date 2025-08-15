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
  const wordleNumber = 1516;
  // Prefer bundled font in server/fonts
  const fontsDir = path.join(process.cwd(), 'fonts');
  let fontPath;
  try {
    const files = fs.readdirSync(fontsDir).filter(n => n.toLowerCase().endsWith('.ttf'));
    if (files.length) fontPath = path.join(fontsDir, files[0]);
  } catch {}
  if (!fontPath) {
    const fontCandidates = [
      'C:/Windows/Fonts/arialuni.ttf',
      'C:/Windows/Fonts/segoeui.ttf',
      'C:/Windows/Fonts/calibri.ttf',
      'C:/Windows/Fonts/arial.ttf'
    ];
    for (const c of fontCandidates) {
      if (fs.existsSync(c)) { fontPath = c; break; }
    }
  }
  console.log('Using fontPath:', fontPath || '(default resolver)');
  const buf = await generateShareImage(state, wordleNumber, { fontPath });
  await writeFile('share-test.png', buf);
  console.log('wrote share-test.png', buf.length);
}

main().catch(e => {
  console.error('Failed to generate share image:', e && e.stack || e);
  process.exit(1);
});
