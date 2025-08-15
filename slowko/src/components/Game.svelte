<script lang="ts">
	import { fade } from "svelte/transition";
	import Header from "./Header.svelte";
	import { Board } from "./board";
	import Keyboard from "./keyboard";
	import Modal from "./Modal.svelte";
	import { getContext, onMount, setContext, createEventDispatcher } from "svelte";
	import Settings from "./settings";
	import { get } from "svelte/store";
	import {
		Share,
		Separator,
		Definition,
		Tutorial,
		Statistics,
		Distribution,
		Timer,
		Toaster,
		ShareGame,
		Tips,
		Historical,
	} from "./widgets";
	import {
		contractNum,
		DELAY_INCREMENT,
		PRAISE,
		modeData,
		ROWS,
		newSeed,
		GameState,
		seededRandomInt,
		LetterStates,
		words,
		Stats,
	} from "../utils";
	import { letterStates, settings, mode, wordLength, extraHard } from "../stores";
	import type { LetterState, Swipe } from "../types";

	export let word: string;
	export let stats: Stats;
	export let game: GameState;
	export let toaster: Toaster;
	// Function passed from parent App to send progress state to Discord backend
	export let sendState: (grid: LetterState[][]) => Promise<any> | void;

	setContext("toaster", toaster);
	const version = getContext<string>("version");
	const dispatch = createEventDispatcher();

	// implement transition delay on keys
	const delay = DELAY_INCREMENT * ROWS + 800;

	let showTutorial = $settings.tutorial === 3;
	let showSettings = false;
	let showStats = false;
	let showHistorical = false;
	let showRefresh = false;

	let board: Board;
	let timer: Timer;

	function submitWord() {
		if (game.latestWord.length !== get(wordLength)+4) {
				toaster.pop("Za mało liter");
			board.shake(game.guesses);
		} else if (words.contains(game.latestWord)) {
			if (game.guesses > 0) {
				const hm = game.checkHardMode();
				if ($settings.hard[$mode]) {
					if (hm.type === "🟩") {
						toaster.pop(
							`${contractNum(hm.pos + 1)} litera musi być: ${hm.char.toUpperCase()}`
						);
						board.shake(game.guesses);
						return;
					} else if (hm.type === "🟨") {
						toaster.pop(`Słowo musi zawierać: ${hm.char.toUpperCase()}`);
						board.shake(game.guesses);
						return;
					}
				} else if (hm.type !== "⬛") {
					game.validHard = false;
				}
			}
			game.board.state[game.guesses] = game.guess(word);
			++game.guesses;
			$letterStates.update(game.lastState, game.lastWord);
			$letterStates = $letterStates;

			// Notify parent about updated board state (fire and forget)
			try { sendState && sendState(game.board.state as unknown as LetterState[][]); } catch {}

			
			if (game.lastWord === word) win();
		} else {
				toaster.pop("Nie ma na liście słów");
			board.shake(game.guesses);
		}
	}

	setTimeout(() => {
		wordLength.subscribe(reload);
	}, 1000);



	function win() {
		board.bounce(game.guesses - 1);
		game.active = false;
		setTimeout(
			() => toaster.pop(PRAISE[game.guesses - 1]),
			DELAY_INCREMENT * $wordLength+4 + DELAY_INCREMENT
		);
		setTimeout(setShowStatsTrue, delay * 1.4);
		if (!modeData.modes[$mode].historical) {
			stats.addWin(game.guesses, modeData.modes[$mode]);
			stats = stats;
			localStorage.setItem(`stats-${$mode}-${wordLength}`, stats.toString());
		}
	}

	function lose() {
		game.active = false;
		setTimeout(setShowStatsTrue, delay);
		if (!modeData.modes[$mode].historical) {
			stats.addLoss(modeData.modes[$mode]);
			stats = stats;
			localStorage.setItem(`stats-${$mode}-${wordLength}`, stats.toString());
		}
	}

	function concede() {
		showSettings = false;
		setTimeout(setShowStatsTrue, DELAY_INCREMENT);
		lose();
	}

	function reload() {
		modeData.modes[$mode].historical = false;
		modeData.modes[$mode].seed = newSeed($mode);
		game = new GameState($mode, localStorage.getItem(`state-${$mode}-${$extraHard}-${$wordLength}`));
		word = words.words[seededRandomInt(0, words.words.length, modeData.modes[$mode].seed)];
		$letterStates = new LetterStates();
		showStats = false;
		showRefresh = false;
		timer.reset($mode);
	}

	function setShowStatsTrue() {
		if (!game.active) showStats = true;
	}

	function onSwipe(e: Swipe) {
		switch (e.detail.direction) {
			case "left":
				$mode = ($mode + 1) % modeData.modes.length;
				toaster.pop(modeData.modes[$mode].name);
				break;
			case "right":
				$mode = ($mode - 1 + modeData.modes.length) % modeData.modes.length;
				toaster.pop(modeData.modes[$mode].name);
				break;
		}
	}

	onMount(() => {
		if (!game.active) setTimeout(setShowStatsTrue, delay);
		// Notify parent App that game component mounted and initial sync is done
		// slight timeout lets browser paint loader at least once if heavy init follows
		setTimeout(()=> dispatch('ready'), 0);
	});
	// $: toaster.pop(word);
</script>

<svelte:body on:click={board.hideCtx} on:contextmenu={board.hideCtx} />

<main class:guesses={game.guesses !== 0} style="--rows: {ROWS}; --cols: {$wordLength+4}">
	<Header
		bind:showRefresh
		tutorial={$settings.tutorial === 2}
		on:closeTutPopUp|once={() => ($settings.tutorial = 1)}
		showStats={stats.played > 0 || (modeData.modes[$mode].historical && !game.active)}
		on:stats={() => (showStats = true)}
		on:tutorial={() => (showTutorial = true)}
		on:settings={() => (showSettings = true)}
		on:reload={reload}
	/>
	<Board
		bind:this={board}
		bind:value={game.board.words}
		tutorial={$settings.tutorial === 1}
		on:closeTutPopUp|once={() => ($settings.tutorial = 0)}
		board={game.board}
		guesses={game.guesses}
		icon={modeData.modes[$mode].icon}
		on:swipe={onSwipe}
	/>
	<Keyboard
		on:keystroke={() => {
			if ($settings.tutorial) $settings.tutorial = 0;
			board.hideCtx();
		}}
		bind:value={game.board.words[game.guesses === ROWS ? 0 : game.guesses]}
		on:submitWord={submitWord}
		on:esc={() => {
			showTutorial = false;
			showStats = false;
			showSettings = false;
		}}
		disabled={!game.active || $settings.tutorial === 3 || showHistorical}
	/>
</main>

<Modal
	bind:visible={showTutorial}
	on:close|once={() => $settings.tutorial === 3 && --$settings.tutorial}
	fullscreen={$settings.tutorial === 0}
>
	<Tutorial visible={showTutorial} />
</Modal>

	<Modal bind:visible={showStats}>
		{#if modeData.modes[$mode].historical}
			<h2 class="historical">Statystyki niedostępne dla gier historycznych</h2>
		{:else}
			<Statistics data={stats} />
			<Distribution distribution={stats.guesses} {game} />
		{/if}
		<Separator visible={!game.active}>
			<Timer
				slot="1"
				bind:this={timer}
				on:timeup={() => (showRefresh = true)}
				on:reload={reload}
			/>
			<Share slot="2" state={game} />
		</Separator>
		<ShareGame wordNumber={game.wordNumber} />
		{#if !game.active}
			<Definition {word} alternates={2} />
		{:else}
			<!-- Fade with delay is to prevent a bright red button from appearing as soon as refresh is pressed -->
			<div
				in:fade={{ delay: 300 }}
				class="button concede"
				on:click={concede}
				on:keydown={concede}
			>
			Poddaj się
			</div>
		{/if}
	</Modal>

	<Modal fullscreen={true} bind:visible={showSettings}>
		<Settings state={game} on:historical={() => (showHistorical = true)} />
		{#if game.active}
			<div class="button concede" on:click={concede} on:keydown={concede}>Poddaj się</div>
		{/if}
		<Tips change={showSettings} />

		<svelte:fragment slot="footer">
			<a href="https://www.nytimes.com/games/wordle/" target="_blank" rel="noreferrer"
				>Oryginalny Wordle</a
			>
			<div>
				<div>v{version}</div>
				<div
					title="kliknij dwukrotnie, aby zresetować statystyki"
					class="word"
					on:dblclick={() => {
						localStorage.clear();
						toaster.pop("localStorage wyczyszczone");
					}}
				>
					{modeData.modes[$mode].name} słowo #{game.wordNumber}
				</div>
			</div>
		</svelte:fragment>
	</Modal>

<Modal bind:visible={showHistorical}>
	<Historical bind:showSettings />
</Modal>

<style lang="scss">
	main {
		display: flex;
		flex-direction: column;
		justify-content: space-between;
		align-items: center;
		height: 100%;
		max-width: var(--game-width);
		margin: auto;
		position: relative;
	}
	.historical {
		text-align: center;
		margin-top: 10px;
		padding: 0 20px;
		text-transform: uppercase;
	}
	.concede {
		background-color: var(--red);
	}
</style>
