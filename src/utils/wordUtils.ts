export type LetterState = "correct" | "present" | "absent" | "empty";

export const POLISH_LETTERS = new Set(
  Array.from("AĄBCĆDEĘFGHIJKLŁMNŃOÓPRSŚTUWYZŹŻ")
);

export function normalizeInput(ch: string) {
  return ch.toUpperCase();
}

export function evaluateGuess(guess: string, solution: string): LetterState[] {
  const g = guess.toUpperCase();
  const s = solution.toUpperCase();
  const len = s.length;
  const result: LetterState[] = new Array(len).fill("absent");

  const unmatched: Record<string, number> = {};

  for (let i = 0; i < len; i++) {
    if (g[i] === s[i]) {
      result[i] = "correct";
    } else {
      const ch = s[i];
      unmatched[ch] = (unmatched[ch] || 0) + 1;
    }
  }

  for (let i = 0; i < len; i++) {
    if (result[i] === "correct") continue;
    const ch = g[i];
    if (unmatched[ch] && unmatched[ch] > 0) {
      result[i] = "present";
      unmatched[ch]!--;
    } else {
      result[i] = "absent";
    }
  }

  return result;
}

export function isAllowedChar(ch: string) {
  const up = ch.toUpperCase();
  return POLISH_LETTERS.has(up);
}
