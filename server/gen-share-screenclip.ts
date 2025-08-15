import { writeShareImage } from './boardpng.js';

async function main() {
  const state = [
    ['⬛','⬛','⬛','🟩','⬛'],
    ['🟨','⬛','⬛','🟨','⬛'],
    ['⬛','⬛','🟨','🟨','⬛'],
    ['🟨','⬛','⬛','🟩','⬛'],
    ['🟩','🟩','🟩','🟩','🟩'],
    ['🔳','🔳','🔳','🔳','🔳']
  ];
  const players = [{ state }];

  const out = await writeShareImage(players as any, 1516, {});
  console.log('wrote to', out);
}

main().catch(e => { console.error(e); process.exit(1); });
