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
  const players = [{
    state,
    avatar: 'c:/Users/patry/AppData/Local/Packages/MicrosoftWindows.Client.CBS_cw5n1h2txyewy/TempState/ScreenClip/{E9F77DEB-D23E-4144-B47C-D9CCCFA23F1A}.png'
  }];

  const out = await writeShareImage(players, 1516, {});
  console.log('wrote to', out);
}

main().catch(e => { console.error(e); process.exit(1); });
