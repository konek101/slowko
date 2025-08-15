import seedRandom from "seedrandom";
import { GameMode, ms } from "./enums";
import wordList from "./words_5";
import word4 from "./assets/4_letter_words";
import word5 from "./assets/5_letter_words";
import word6 from "./assets/6_letter_words";
import word7 from "./assets/7_letter_words";
import allValid from './assets/vaildpl'
import { extraHard, wordLength } from "./stores";
import { get } from "svelte/store";
import type { GameBoard, HardModeData, LetterState, Mode, ModeData } from "./types";
export let ROWS = 6;

type WordList = {
	words: string[];
	valid: string[];
	contains: (word: string) => boolean;
};

export const words: WordList = new Proxy({} as WordList, {
	get(_, prop: keyof WordList) {
		const len = get(wordLength);
		let data: WordList;
		const targetLen = len + 4;
		// Detect "extra hard mode" (custom logic: either a global flag or localStorage key)
		const extraHardMode = get(extraHard);

		if (extraHardMode) {
			const filtered = allValid.filter(w => w.length === targetLen);
			data = {
				...wordList,
				words: filtered,
				valid: filtered,
				contains: (word: string) => filtered.includes(word)
			};
			return data[prop];
		}
		if (len === 0) {
			data = {
				...wordList,
				words: word4,
				valid: allValid,
				contains: (word: string) => word4.includes(word) || allValid.includes(word)
			};
		} else if (len === 1) {
			data = {
				...wordList,
				words: word5,
				valid: allValid,
				contains: (word: string) => word5.includes(word) || allValid.includes(word)
			};
		} else if (len === 2) {
			data = {
				...wordList,
				words: word6,
				valid: allValid,
				contains: (word: string) => word6.includes(word) || allValid.includes(word)
			};
		} else if (len === 3) {
			data = {
				...wordList,
				words: word7,
				valid: allValid,
				contains: (word: string) => word7.includes(word) || allValid.includes(word)
			};
		} else {
			data = {
				...wordList,
				valid: allValid,
				contains: (word: string) =>
					wordList.words.includes(word) || wordList.valid.includes(word) || allValid.includes(word)
			};
		}
		return data[prop];
	}
});



class Tile {
	public value: string;
	public notSet: Set<string>;
	constructor() {
		this.notSet = new Set<string>();
	}
	not(char: string) {
		this.notSet.add(char);
	}
}

class WordData {
	public letterCounts: Map<string, [number, boolean]>;
	private notSet: Set<string>;
	public word: Tile[];
	constructor() {
		this.notSet = new Set<string>();
		this.letterCounts = new Map<string, [number, boolean]>();
		this.word = [];
		for (let col = 0; col < get(wordLength) + 4; ++col) {
			this.word.push(new Tile());
		}
	}
	confirmCount(char: string) {
		let c = this.letterCounts.get(char);
		if (!c) {
			this.not(char);
		} else {
			c[1] = true;
		}
	}
	countConfirmed(char: string) {
		const val = this.letterCounts.get(char);
		return val ? val[1] : false;
	}
	setCount(char: string, count: number) {
		let c = this.letterCounts.get(char);
		if (!c) {
			this.letterCounts.set(char, [count, false]);
		} else {
			c[0] = count;
		}
	}
	incrementCount(char: string) {
		++this.letterCounts.get(char)[0];
	}
	not(char: string) {
		this.notSet.add(char);
	}
	inGlobalNotList(char: string) {
		return this.notSet.has(char);
	}
	lettersNotAt(pos: number) {
		return new Set([...this.notSet, ...this.word[pos].notSet]);
	}
}

export function getRowData(n: number, board: GameBoard) {
	const wd = new WordData();
	for (let row = 0; row < n; ++row) {
		const occurred = new Set<string>();
		for (let col = 0; col < get(wordLength)+4; ++col) {
			const state = board.state[row][col];
			const char = board.words[row][col];
			if (state === "⬛") {
				wd.confirmCount(char);
				// if char isn't in the global not list add it to the not list for that position
				if (!wd.inGlobalNotList(char)) {
					wd.word[col].not(char);
				}
				continue;
			}
			// If this isn't the first time this letter has occurred in this row
			if (occurred.has(char)) {
				wd.incrementCount(char);
			} else if (!wd.countConfirmed(char)) {
				occurred.add(char);
				wd.setCount(char, 1);
			}
			if (state === "🟩") {
				wd.word[col].value = char;
			}
			else {	// if (state === "🟨")
				wd.word[col].not(char);
			}
		}
	}

	let exp = "";
	for (let pos = 0; pos < wd.word.length; ++pos) {
		exp += wd.word[pos].value ? wd.word[pos].value : `[^${[...wd.lettersNotAt(pos)].join(" ")}]`;
	}
	return (word: string) => {
		if (new RegExp(exp).test(word)) {
			const chars = word.split("");
			for (const e of wd.letterCounts) {
				const occurrences = countOccurrences(chars, e[0]);
				if (!occurrences || (e[1][1] && occurrences !== e[1][0])) return false;
			}
			return true;
		}
		return false;
	};
}

function countOccurrences<T>(arr: T[], val: T) {
	return arr.reduce((count, v) => v === val ? count + 1 : count, 0);
}

export function contractNum(n: number) {
	// W języku polskim nie używa się takich końcówek, zwracamy tylko liczbę
	return `${n}`;
}

export const keys = ["qweęrtyuioóp", "aąsśdfghjklł", "zźżxcćvbnńm"];

/**
 * Return a deterministic number based on the given mode and current or given time.
 * @param mode - The mode
 * @param time - The time. If omitted current time is used
 */
export function newSeed(mode: GameMode, time?: number) {
	const now = time ?? Date.now();
	switch (mode) {
		case GameMode.daily:
			// Adds time zone offset to UTC time, calculates how many days that falls after 1/1/1970
			// and returns the unix time for the beginning of that day.
			return Date.UTC(1970, 0, 1 + Math.floor((now - (new Date().getTimezoneOffset() * ms.MINUTE)) / ms.DAY));
		case GameMode.hourly:
			return now - (now % ms.HOUR);
		// case GameMode.minutely:
		// 	return now - (now % ms.MINUTE);
		case GameMode.infinite:
			return now - (now % ms.SECOND);
	}
}

export const modeData: ModeData = {
	default: GameMode.daily,
	modes: [
		{
			   name: "Dzienny",
			unit: ms.DAY,
			start: 1754863200000,	// 11/08/2025 UTC+2
			seed: newSeed(GameMode.daily),
			historical: false,
			streak: true,
			useTimeZone: true,
		},
		{
			   name: "Godzinny",
			unit: ms.HOUR,
			start: 	1754863200000,	// 18/01/2025 8:00pm UTC+2
			seed: newSeed(GameMode.hourly),
			historical: false,
			icon: "m50,7h100v33c0,40 -35,40 -35,60c0,20 35,20 35,60v33h-100v-33c0,-40 35,-40 35,-60c0,-20 -35,-20 -35,-60z",
			streak: true,
		},
		{
			   name: "Nieskończony",
			unit: ms.SECOND,
			start: 	1754863200000,	// 17/01/2025 4:10:00pm UTC+2
			seed: newSeed(GameMode.infinite),
			historical: false,
			icon: "m7,100c0,-50 68,-50 93,0c25,50 93,50 93,0c0,-50 -68,-50 -93,0c-25,50 -93,50 -93,0z",
		},
		// {
		// 	name: "Minutely",
		// 	unit: ms.MINUTE,
		// 	start: 1642528800000,	// 18/01/2022 8:00pm
		// 	seed: newSeed(GameMode.minutely),
		// 	historical: false,
		// 	icon: "m7,200v-200l93,100l93,-100v200",
		// 	streak: true,
		// },
	]
};
/**
 * Return the word number for the given mode at the time that that mode's seed was set.
 * @param mode - The game mode
 * @param current - If true the word number will be for the current time rather than for the current
 * seed for the given mode. Useful if you want the current game number during a historical game.
 */
export function getWordNumber(mode: GameMode, current?: boolean) {
	const seed = current ? newSeed(mode) : modeData.modes[mode].seed;
	return Math.round((seed - modeData.modes[mode].start) / modeData.modes[mode].unit) + 1;
}

export function seededRandomInt(min: number, max: number, seed: number) {
	const rng = seedRandom(`${seed}`);
	return Math.floor(min + (max - min) * rng());
}

export const DELAY_INCREMENT = 200;

export const PRAISE = [
		"Genialnie",
		"Wspaniale",
		"Imponująco",
		"Znakomicie",
		"Świetnie",
		"Uff",
];

abstract class Storable {
	toString() { return JSON.stringify(this); }
}

export class GameState extends Storable {
	public active: boolean;
	public guesses: number;
	public validHard: boolean;
	public time: number;
	public wordNumber: number;
	public board: GameBoard;

	#valid = false;
	#mode: GameMode;

	constructor(mode: GameMode, data?: string) {
		super();
		this.#mode = mode;
		if (data) {
			this.parse(data);
		}
		if (!this.#valid) {
			this.active = true;
			this.guesses = 0;
			this.validHard = true;
			this.time = modeData.modes[mode].seed;
			this.wordNumber = getWordNumber(mode);
			this.board = {
				words: Array(ROWS).fill(""),
				state: Array.from({ length: ROWS }, () => (Array(get(wordLength)+4).fill("🔳"))),
			};

			this.#valid = true;
		}
	}
	get latestWord() {
		return this.board.words[this.guesses];
	}
	get lastState() {
		return this.board.state[this.guesses - 1];
	}
	get lastWord() {
		return this.board.words[this.guesses - 1];
	}
	/**
	* Returns an object containing the position of the character in the latest word that violates
	* hard mode, and what type of violation it is, if there is a violation.
	*/
	checkHardMode(): HardModeData {
		for (let i = 0; i < get(wordLength)+4; ++i) {
			if (this.board.state[this.guesses - 1][i] === "🟩" && this.board.words[this.guesses - 1][i] !== this.board.words[this.guesses][i]) {
				return { pos: i, char: this.board.words[this.guesses - 1][i], type: "🟩" };
			}
		}
		for (let i = 0; i < get(wordLength)+4; ++i) {
			if (this.board.state[this.guesses - 1][i] === "🟨" && !this.board.words[this.guesses].includes(this.board.words[this.guesses - 1][i])) {
				return { pos: i, char: this.board.words[this.guesses - 1][i], type: "🟨" };
			}
		}
		return { pos: -1, char: "", type: "⬛" };
	}
	guess(word: string) {
		const characters = word.split("");
		const result = Array<LetterState>(get(wordLength)+4).fill("⬛");
		for (let i = 0; i < get(wordLength)+4; ++i) {
			if (characters[i] === this.latestWord.charAt(i)) {
				result[i] = "🟩";
				characters[i] = "$";
			}
		}
		for (let i = 0; i < get(wordLength)+4; ++i) {
			const pos = characters.indexOf(this.latestWord[i]);
			if (result[i] !== "🟩" && pos >= 0) {
				characters[pos] = "$";
				result[i] = "🟨";
			}
		}
		return result;
	}
	private parse(str: string) {
		const parsed = JSON.parse(str) as GameState;
		if (parsed.wordNumber !== getWordNumber(this.#mode)) return;
		this.active = parsed.active;
		this.guesses = parsed.guesses;
		this.validHard = parsed.validHard;
		this.time = parsed.time;
		this.wordNumber = parsed.wordNumber;
		this.board = parsed.board;

		this.#valid = true;
	}
}


export class Settings extends Storable {
	public hard = new Array(modeData.modes.length).fill(false);
	public dark = true;
	public colorblind = false;
	public tutorial: 0 | 1 | 2 | 3 = 3;

	constructor(settings?: string) {
		super();
		if (settings) {
			const parsed = JSON.parse(settings) as Settings;
			this.hard = parsed.hard;
			this.dark = parsed.dark;
			this.colorblind = parsed.colorblind;
			this.tutorial = parsed.tutorial;
		}
	}
}

export class Stats extends Storable {
	public played = 0;
	public lastGame = 0;
	public guesses = {
		fail: 0,
		1: 0,
		2: 0,
		3: 0,
		4: 0,
		5: 0,
		6: 0,
	};
	public streak: number;
	public maxStreak: number;
	#hasStreak = false;

	constructor(param: string | GameMode) {
		super();
		if (typeof param === "string") {
			this.parse(param);
		} else if (modeData.modes[param].streak) {
			this.streak = 0;
			this.maxStreak = 0;
			this.#hasStreak = true;
		}
	}
	private parse(str: string) {
		const parsed = JSON.parse(str) as Stats;
		this.played = parsed.played;
		this.lastGame = parsed.lastGame;
		this.guesses = parsed.guesses;
		if (parsed.streak != undefined) {
			this.streak = parsed.streak;
			this.maxStreak = parsed.maxStreak;
			this.#hasStreak = true;
		}
	}
	/**
	 * IMPORTANT: When this method is called svelte will not register the update, so you need to set
	 * the variable that this object is assigned to equal to itself to force an update.
	 * Example: `states = states;`.
	 */
	addWin(guesses: number, mode: Mode) {
		++this.guesses[guesses];
		++this.played;
		if (this.#hasStreak) {
			this.streak = mode.seed - this.lastGame > mode.unit ? 1 : this.streak + 1;
			this.maxStreak = Math.max(this.streak, this.maxStreak);
		}
		this.lastGame = mode.seed;
	}
	/**
	 * IMPORTANT: When this method is called svelte will not register the update, so you need to set
	 * the variable that this object is assigned to equal to itself to force an update.
	 * Example: `states = states;`.
	 */
	addLoss(mode: Mode) {
		++this.guesses.fail;
		++this.played;
		if (this.#hasStreak) this.streak = 0;
		this.lastGame = mode.seed;
	}
	get hasStreak() { return this.#hasStreak; }
}

export class LetterStates {
	public a: LetterState = "🔳";
	public b: LetterState = "🔳";
	public c: LetterState = "🔳";
	public d: LetterState = "🔳";
	public e: LetterState = "🔳";
	public f: LetterState = "🔳";
	public g: LetterState = "🔳";
	public h: LetterState = "🔳";
	public i: LetterState = "🔳";
	public j: LetterState = "🔳";
	public k: LetterState = "🔳";
	public l: LetterState = "🔳";
	public m: LetterState = "🔳";
	public n: LetterState = "🔳";
	public o: LetterState = "🔳";
	public p: LetterState = "🔳";
	public q: LetterState = "🔳";
	public r: LetterState = "🔳";
	public s: LetterState = "🔳";
	public t: LetterState = "🔳";
	public u: LetterState = "🔳";
	public v: LetterState = "🔳";
	public w: LetterState = "🔳";
	public x: LetterState = "🔳";
	public y: LetterState = "🔳";
	public z: LetterState = "🔳";

	constructor(board?: GameBoard) {
		if (board) {
			for (let row = 0; row < ROWS; ++row) {
				for (let col = 0; col < board.words[row].length; ++col) {
					if (this[board.words[row][col]] === "🔳" || board.state[row][col] === "🟩") {
						this[board.words[row][col]] = board.state[row][col];
					}
				}
			}
		}
	};
	/**
	 * IMPORTANT: When this method is called svelte will not register the update, so you need to set
	 * the variable that this object is assigned to equal to itself to force an update.
	 * Example: `states = states;`.
	 */
	update(state: LetterState[], word: string) {
		state.forEach((e, i) => {
			const ls = this[word[i]];
			if (ls === "🔳" || e === "🟩") {
				this[word[i]] = e;
			}
		});

	}
}

export function timeRemaining(m: Mode) {
	if (m.useTimeZone) {
		return m.unit - (Date.now() - (m.seed + new Date().getTimezoneOffset() * ms.MINUTE));
	}
	return m.unit - (Date.now() - m.seed);
}

export function failed(s: GameState) {
	return !(s.active || (s.guesses > 0 && s.board.state[s.guesses - 1].join("") === "🟩".repeat(get(wordLength)+4)));
}