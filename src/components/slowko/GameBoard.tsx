import Tile from "./Tile";
import { LetterState } from "@/utils/wordUtils";

interface GameBoardProps {
  rows: number;
  cols: number;
  guesses: string[]; // submitted guesses
  states: LetterState[][]; // states for submitted guesses
  currentGuess: string; // in-progress guess
  shakingRow: number | null;
}

export default function GameBoard({ rows, cols, guesses, states, currentGuess, shakingRow }: GameBoardProps) {
  const filledRows = guesses.length;

  return (
    <div className="grid gap-2" style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}>
      {Array.from({ length: rows }).map((_, rowIdx) => {
        const isSubmitted = rowIdx < filledRows;
        const isCurrent = rowIdx === filledRows;
        const guess = isSubmitted ? guesses[rowIdx] : isCurrent ? currentGuess : "";
        const rowStates: (LetterState | "empty")[] = isSubmitted
          ? states[rowIdx]
          : Array.from({ length: cols }).map(() => "empty");

        return (
          <div
            key={rowIdx}
            className={["grid gap-2 mx-auto", shakingRow === rowIdx ? "animate-shake" : ""].join(" ")}
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, width: `min(100%, ${cols * 3.2}rem)` }}
            role="group"
            aria-label={`rząd ${rowIdx + 1}`}
          >
            {Array.from({ length: cols }).map((__, colIdx) => {
              const letter = guess[colIdx] || "";
              const st = rowStates[colIdx];
              const shouldReveal = isSubmitted;
              return (
                <Tile
                  key={colIdx}
                  letter={letter}
                  state={st}
                  shouldReveal={shouldReveal}
                  revealDelay={colIdx * 100}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
