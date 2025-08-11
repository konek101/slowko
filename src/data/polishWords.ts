export const POLISH_FIVE_LETTER_WORDS = [
  "ŻUREK",
  "SŁOIK",
  "ŁAWKA",
  "ŻABKA",
  "GĄSKA",
  "MŁODY",
  "ŚPIEW",
  "ĆWICZ",
  "ŁÓDKA",
  "RZEKA",
  "PTAKI",
  "KOTEK",
  "DOMEK",
  "NOCNY",
  "GÓRKA",
  "PIÓRO",
  "WIÓRY",
  "SERCE",
  "KAWAŁ",
  "DZIEŃ",
];

export function pickSolutionForToday(list = POLISH_FIVE_LETTER_WORDS, extraSeed = 0) {
  const d = new Date();
  const seed = d.getFullYear() * 1000 + (d.getMonth() + 1) * 50 + d.getDate() + extraSeed;
  const idx = Math.abs(seed) % list.length;
  return list[idx];
}
