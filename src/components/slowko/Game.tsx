import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GameBoard from "./GameBoard";
import Keyboard from "./Keyboard";
import { evaluateGuess, isAllowedChar, LetterState, normalizeInput } from "@/utils/wordUtils";
import { pickSolutionForToday } from "@/data/polishWords";
import { useToast } from "@/hooks/use-toast";

const ROWS = 6;
const COLS = 5;

type GameStatus = "playing" | "won" | "lost";

function bestStatus(prev?: LetterState, next?: LetterState): LetterState | undefined {
  const rank: Record<LetterState, number> = { absent: 0, present: 1, correct: 2, empty: -1 } as any;
  if (!prev) return next;
  if (!next) return prev;
  return rank[next] >= rank[prev] ? next : prev;
}

export default function Game() {
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const solution = useMemo(() => pickSolutionForToday(), []);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [states, setStates] = useState<LetterState[][]>([]);
  const [currentGuess, setCurrentGuess] = useState<string>("");
  const [status, setStatus] = useState<GameStatus>("playing");
  const [shakingRow, setShakingRow] = useState<number | null>(null);
  const [letterStatus, setLetterStatus] = useState<Record<string, LetterState>>({});

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    el.style.setProperty("--pointer-x", `${x}px`);
    el.style.setProperty("--pointer-y", `${y}px`);
  }, []);

  const submitGuess = useCallback(() => {
    if (status !== "playing") return;
    if (currentGuess.length < COLS) {
      setShakingRow(guesses.length);
      setTimeout(() => setShakingRow(null), 650);
      toast({ title: "Za krótko", description: "Wpisz 5-literowe słowo." });
      return;
    }

    const evalStates = evaluateGuess(currentGuess, solution);
    const newGuesses = [...guesses, currentGuess.toUpperCase()];
    const newStates = [...states, evalStates];

    setGuesses(newGuesses);
    setStates(newStates);
    setCurrentGuess("");

    // Update keyboard status
    setLetterStatus((prev) => {
      const next = { ...prev };
      for (let i = 0; i < COLS; i++) {
        const ch = newGuesses[newGuesses.length - 1][i];
        const st = evalStates[i];
        const best = bestStatus(next[ch], st);
        if (best) next[ch] = best;
      }
      return next;
    });

    // End conditions
    if (evalStates.every((s) => s === "correct")) {
      setStatus("won");
      toast({ title: "Brawo!", description: "Zgadłeś/zgadłaś hasło!" });
      return;
    }
    if (newGuesses.length >= ROWS) {
      setStatus("lost");
      toast({ title: "Koniec gry", description: `Hasło: ${solution}` });
    }
  }, [COLS, ROWS, currentGuess, guesses, solution, states, status, toast]);

  const handleKey = useCallback(
    (raw: string) => {
      const key = normalizeInput(raw);
      if (status !== "playing") return;

      if (key === "ENTER") {
        submitGuess();
        return;
      }
      if (key === "BACKSPACE") {
        setCurrentGuess((g) => g.slice(0, -1));
        return;
      }

      if (currentGuess.length >= COLS) return;
      if (!isAllowedChar(key)) return;

      setCurrentGuess((g) => (g + key).slice(0, COLS));
    },
    [status, submitGuess, currentGuess.length]
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const k = e.key;
      if (k === "Enter" || k === "Backspace") {
        handleKey(k);
      } else {
        const ch = k.length === 1 ? k : "";
        if (ch) handleKey(ch);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleKey]);

  const reset = () => {
    setGuesses([]);
    setStates([]);
    setCurrentGuess("");
    setStatus("playing");
    setShakingRow(null);
    setLetterStatus({});
  };

  return (
    <div
      ref={containerRef}
      onMouseMove={onMouseMove}
      className="relative rounded-xl border p-4 md:p-6 shadow-sm overflow-hidden"
      style={{ boxShadow: "var(--shadow-elegant)" as any }}
    >
      <div className="absolute inset-x-0 -top-16 h-32" style={{ background: "var(--gradient-primary)" }} aria-hidden />
      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg md:text-xl font-semibold tracking-tight">Słówko</h3>
          <div className="flex gap-2">
            <button className="kbd" onClick={reset} aria-label="nowa gra">Nowa gra</button>
          </div>
        </div>

        <div className="flex flex-col items-center gap-6">
          <GameBoard
            rows={ROWS}
            cols={COLS}
            guesses={guesses}
            states={states}
            currentGuess={currentGuess}
            shakingRow={shakingRow}
          />

          <Keyboard
            onKey={(k) => handleKey(String(k))}
            letterStatus={letterStatus}
          />
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          Zgadnij 5-literowe słowo w 6 próbach. Po każdej próbie kafelki pokażą, jak blisko jesteś.
        </p>
      </div>
    </div>
  );
}
