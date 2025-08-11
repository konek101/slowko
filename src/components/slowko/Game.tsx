import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GameBoard from "./GameBoard";
import Keyboard from "./Keyboard";
import SettingsBar from "./SettingsBar";
import { evaluateGuess, isAllowedChar, LetterState, normalizeInput } from "@/utils/wordUtils";
import { POLISH_FIVE_LETTER_WORDS, pickSolutionForToday } from "@/data/polishWords";
import { loadDictionary, Dictionary } from "@/data/dictionary";
import { useToast } from "@/hooks/use-toast";

function bestStatus(prev?: LetterState, next?: LetterState): LetterState | undefined {
  const rank: Record<LetterState, number> = { absent: 0, present: 1, correct: 2, empty: -1 } as any;
  if (!prev) return next;
  if (!next) return prev;
  return rank[next] >= rank[prev] ? next : prev;
}

function pickSolutionFromDict(dict: Dictionary | null, length: number) {
  const d = new Date();
  const seed = d.getFullYear() * 1000 + (d.getMonth() + 1) * 50 + d.getDate() + length;
  const list = dict?.get(length) ? Array.from(dict!.get(length)!) : POLISH_FIVE_LETTER_WORDS;
  const idx = Math.abs(seed) % list.length;
  return list[idx];
}

export default function Game() {
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Settings
  const [wordLength, setWordLength] = useState<number>(5);
  const [maxAttempts, setMaxAttempts] = useState<number>(6);

  // Dictionary
  const [dict, setDict] = useState<Dictionary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      const d = await loadDictionary();
      if (mounted) {
        setDict(d);
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Game state
  const [solution, setSolution] = useState<string>(() => pickSolutionForToday());
  const [guesses, setGuesses] = useState<string[]>([]);
  const [states, setStates] = useState<LetterState[][]>([]);
  const [currentGuess, setCurrentGuess] = useState<string>("");
  const [status, setStatus] = useState<"playing" | "won" | "lost">("playing");
  const [shakingRow, setShakingRow] = useState<number | null>(null);
  const [letterStatus, setLetterStatus] = useState<Record<string, LetterState>>({});

  // Refresh solution when settings or dict change
  useEffect(() => {
    const sol = pickSolutionFromDict(dict, wordLength);
    setSolution(sol.toUpperCase());
    // Hard reset when settings change
    setGuesses([]);
    setStates([]);
    setCurrentGuess("");
    setStatus("playing");
    setShakingRow(null);
    setLetterStatus({});
  }, [dict, wordLength]);

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
    if (currentGuess.length < wordLength) {
      setShakingRow(guesses.length);
      setTimeout(() => setShakingRow(null), 650);
      toast({ title: "Za krótko", description: `Wpisz ${wordLength}-literowe słowo.` });
      return;
    }

    // Validate against dictionary (if available for given length)
    const validSet = dict?.get(wordLength);
    if (validSet && !validSet.has(currentGuess.toUpperCase())) {
      setShakingRow(guesses.length);
      setTimeout(() => setShakingRow(null), 650);
      toast({ title: "Nie ma takiego słowa", description: "Spróbuj inne." });
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
      for (let i = 0; i < wordLength; i++) {
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
    if (newGuesses.length >= maxAttempts) {
      setStatus("lost");
      toast({ title: "Koniec gry", description: `Hasło: ${solution}` });
    }
  }, [currentGuess, dict, guesses, maxAttempts, solution, status, toast, wordLength]);

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

      if (currentGuess.length >= wordLength) return;
      if (!isAllowedChar(key)) return;

      setCurrentGuess((g) => (g + key).slice(0, wordLength));
    },
    [status, submitGuess, currentGuess.length, wordLength]
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

  const onSettingsChange = (data: { length?: number; attempts?: number }) => {
    if (data.length) setWordLength(data.length);
    if (data.attempts) setMaxAttempts(data.attempts);
  };

  if (loading) {
    return (
      <div className="rounded-xl border p-6 animate-fade-in">
        <div className="h-6 w-32 bg-muted rounded mb-4" />
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(5, minmax(0, 1fr))` }}>
          {Array.from({ length: 15 }).map((_, i) => (
            <div key={i} className="tile tile-empty animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

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
          <div className="flex items-center gap-3">
            <SettingsBar length={wordLength} attempts={maxAttempts} onChange={onSettingsChange} />
            <button className="kbd" onClick={reset} aria-label="nowa gra">Nowa gra</button>
          </div>
        </div>

        <div className="flex flex-col items-center gap-6">
          <GameBoard
            rows={maxAttempts}
            cols={wordLength}
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
          Zgadnij {wordLength}-literowe słowo w {maxAttempts} próbach. Po każdej próbie kafelki pokażą, jak blisko jesteś.
        </p>
      </div>
    </div>
  );
}
