export type Dictionary = Map<number, Set<string>>;

import { POLISH_FIVE_LETTER_WORDS } from "./polishWords";

export async function loadDictionary(): Promise<Dictionary> {
  try {
    const res = await fetch("/polish_dictionary.csv");
    if (!res.ok) throw new Error("csv not found");
    const text = await res.text();
    return parseCsvDictionary(text);
  } catch (e) {
    // Fallback: only 5-letter list
    const dict: Dictionary = new Map();
    dict.set(5, new Set(POLISH_FIVE_LETTER_WORDS.map((w) => w.toUpperCase())));
    return dict;
  }
}

export function parseCsvDictionary(csv: string): Dictionary {
  const lines = csv.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map((h) => parseInt(h.trim(), 10));
  const dict: Dictionary = new Map();
  headers.forEach((len) => dict.set(len, new Set()));

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    for (let c = 0; c < headers.length; c++) {
      const word = (cells[c] || "").trim();
      if (word) {
        const up = word.toUpperCase();
        const len = headers[c];
        if (up.length === len) {
          dict.get(len)!.add(up);
        }
      }
    }
  }
  return dict;
}
