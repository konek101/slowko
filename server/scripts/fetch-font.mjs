// Downloads an open-licensed TTF into server/fonts if none exists.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import https from 'https';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontsDir = path.join(__dirname, '..', 'fonts');
const target = path.join(fontsDir, 'NotoSans-Regular.ttf');

function ensureDir(p) {
  try { fs.mkdirSync(p, { recursive: true }); } catch {}
}

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const req = https.get(url, (res) => {
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => {});
        return reject(new Error(`HTTP ${res.statusCode} on ${url}`));
      }
      res.pipe(file);
    });
    req.on('error', (err) => {
      file.close();
      fs.unlink(dest, () => {});
      reject(err);
    });
    file.on('finish', () => file.close(resolve));
    file.on('error', (err) => {
      file.close();
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function main() {
  ensureDir(fontsDir);
  // If any .ttf exists, skip
  const existing = fs.readdirSync(fontsDir).some((n) => n.toLowerCase().endsWith('.ttf'));
  if (existing) {
    console.log('Fonts folder already has a TTF; skipping download.');
    return;
  }
  const urls = [
    // Noto Sans Regular TTF (OFL license)
    'https://raw.githubusercontent.com/notofonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf',
    // DejaVu Sans as fallback (OFL license)
    'https://raw.githubusercontent.com/dejavu-fonts/dejavu-fonts/version_2_37/ttf/DejaVuSans.ttf'
  ];
  let ok = false;
  for (const url of urls) {
    console.log('Downloading bundled font:', url);
    try {
      await download(url, target);
      console.log('Downloaded font to', target);
      ok = true;
      break;
    } catch (err) {
      console.warn('Failed to download font from', url, '-', err.message);
    }
  }
  if (!ok) console.warn('No bundled font downloaded; you may add a TTF to server/fonts manually.');
}

main();
