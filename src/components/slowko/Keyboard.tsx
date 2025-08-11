import { Delete } from "lucide-react";
import { LetterState } from "@/utils/wordUtils";

const row1 = ["Q","W","E","R","T","Y","U","I","O","P"] as const;
const row2 = ["A","Ą","S","Ś","D","F","G","H","J","K","L","Ł"] as const;
const row3 = ["Enter","Z","Ż","Ź","X","C","Ć","V","B","N","Ń","M","Ó","Backspace"] as const;

type KeyVal = typeof row1[number] | typeof row2[number] | typeof row3[number];

interface KeyboardProps {
  onKey: (key: KeyVal) => void;
  letterStatus: Record<string, LetterState>;
}

export default function Keyboard({ onKey, letterStatus }: KeyboardProps) {
  const getKeyClass = (k: string) => {
    const st = letterStatus[k];
    if (st === "correct") return "kbd kbd-correct";
    if (st === "present") return "kbd kbd-present";
    if (st === "absent") return "kbd kbd-absent";
    return "kbd";
  };

  return (
    <div className="mt-6 select-none">
      <div className="flex gap-1 justify-center mb-2">
        {row1.map((k) => (
          <button key={k} className={getKeyClass(k)} onClick={() => onKey(k)} aria-label={`litera ${k}`}>
            {k}
          </button>
        ))}
      </div>
      <div className="flex gap-1 justify-center mb-2">
        {row2.map((k) => (
          <button key={k} className={getKeyClass(k)} onClick={() => onKey(k)} aria-label={`litera ${k}`}>
            {k}
          </button>
        ))}
      </div>
      <div className="flex gap-1 justify-center">
        {row3.map((k) => (
          <button
            key={k}
            className={getKeyClass(k) + (k === "Enter" || k === "Backspace" ? " px-3 md:px-4" : "")}
            onClick={() => onKey(k)}
            aria-label={k === "Enter" ? "zatwierdź" : k === "Backspace" ? "usuń" : `litera ${k}`}
          >
            {k === "Backspace" ? <Delete className="w-5 h-5" aria-hidden /> : k}
          </button>
        ))}
      </div>
    </div>
  );
}
