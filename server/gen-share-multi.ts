import { generateShareImageFast as generateShareImage } from "./boardpng.js";
import { writeFile } from "fs/promises";
import fs from "fs";
import path from "path";

async function main() {
  const state = [
    ["⬛", "⬛", "⬛", "🟩", "⬛"],
    ["🟨", "⬛", "⬛", "🟨", "⬛"],
    ["⬛", "⬛", "🟨", "🟨", "⬛"],
    ["🟨", "⬛", "⬛", "🟩", "⬛"],
    ["🟩", "🟩", "🟩", "🟩", "🟩"],
    ["🔳", "🔳", "🔳", "🔳", "🔳"],
  ];

  // Prefer bundled font in server/fonts
  const fontsDir = path.join(process.cwd(), "fonts");
  let fontPath: string | undefined;
  try {
    const files = fs
      .readdirSync(fontsDir)
      .filter((n) => n.toLowerCase().endsWith(".ttf"));
    if (files.length) fontPath = path.join(fontsDir, files[0]);
  } catch {}

  const players = [
    {
      state,
      avatar:
        "C:\\Users\\patry\\Dokumenty\\discord\\getting-started-activity\\server\\cache\\avatars",
    },
    {
      state,
      avatar:
        "C:\\Users\\patry\\Dokumenty\\discord\\getting-started-activity\\server\\cache\\avatars",
    },
    {
      state,
      avatar:
        "C:\\Users\\patry\\Dokumenty\\discord\\getting-started-activity\\server\\cache\\avatars",
    },
  ];

  const plr2 = JSON.parse(
    '[  {    "state": [      [        ":white_square_button:",        ":white_square_button:",        ":white_square_button:",        ":white_square_button:",        ":white_square_button:"      ],      [        ":white_square_button:",        ":white_square_button:",        ":white_square_button:",        ":white_square_button:",        ":white_square_button:"      ],      [        ":white_square_button:",        ":white_square_button:",        ":white_square_button:",        ":white_square_button:",        ":white_square_button:"      ],      [        ":white_square_button:",        ":white_square_button:",        ":white_square_button:",        ":white_square_button:",        ":white_square_button:"      ],      [        ":white_square_button:",        ":white_square_button:",        ":white_square_button:",        ":white_square_button:",        ":white_square_button:"      ],      [        ":white_square_button:",        ":white_square_button:",        ":white_square_button:",        ":white_square_button:",        ":white_square_button:"      ]    ],    "avatar": "C:\\Users\\patry\\Dokumenty\\discord\\getting-started-activity\\server\\cache\\avatars\\55015aca7604d2a3b6bfa17cc951351b5a01980a.png"  }]'
  );

  const buf = await generateShareImage(plr2 as any, 1516, {
    fontPath,
    headerText: "Wordle No. 1516",
  });
  await writeFile("share-multi.png", buf as any);
  console.log("wrote share-multi.png", (buf as any).length ?? "");
}

main().catch((e) => {
  console.error(
    "Failed to generate multi share image:",
    (e as any)?.stack || e
  );
  process.exit(1);
});
