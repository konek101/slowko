import { LetterState } from "@/utils/wordUtils";

interface TileProps {
  letter?: string;
  state: LetterState | "empty";
  revealDelay?: number;
  shouldReveal?: boolean;
}

const stateClass: Record<LetterState | "empty", string> = {
  correct: "tile-correct",
  present: "tile-present",
  absent: "tile-absent",
  empty: "tile-empty",
};

export default function Tile({ letter = "", state, revealDelay = 0, shouldReveal = false }: TileProps) {
  return (
    <div
      className={["tile", stateClass[state], shouldReveal ? "animate-flip" : ""].join(" ")}
      style={shouldReveal ? { animationDelay: `${revealDelay}ms`, transformStyle: "preserve-3d" as any } : undefined}
      aria-label={letter || "puste pole"}
    >
      {letter}
    </div>
  );
}
