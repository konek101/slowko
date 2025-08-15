<script lang="ts">
	import { ROWS } from "../../utils";
	import { get } from "svelte/store";
	import { wordLength } from "../../stores";
	import { Tile } from "../board";
	export let visible: boolean;
</script>

<h3>jak grać</h3>
<div>Odgadnij <strong>WORDLE</strong> w {ROWS} próbach.</div>
<div>Każda próba musi być poprawnym {get(wordLength)+4}-literowym słowem. Naciśnij enter, aby zatwierdzić.</div>
<div>
	Po każdej próbie kolor pól zmieni się, aby pokazać jak blisko byłeś poprawnego słowa.
</div>
<div class:complete={visible} class="examples">
	<div><strong>Przykłady</strong></div>
	<!-- Przykład 1: słowo "MOTYL" (motyl) -->
	<div class="row">
		<Tile value="m" state="🟩" />
		<Tile value="o" state="🔳" />
		<Tile value="t" state="🔳" />
		<Tile value="y" state="🔳" />
		<Tile value="l" state="🔳" />
	</div>
	<div>Litera <strong>M</strong> jest w słowie i na właściwym miejscu.</div>
	<!-- Przykład 2: słowo "KOSZY" (koszy) -->
	<div class="row">
		<Tile value="k" state="🔳" />
		<Tile value="o" state="🟨" />
		<Tile value="s" state="🔳" />
		<Tile value="z" state="🔳" />
		<Tile value="y" state="🔳" />
	</div>
	<div>Litera <strong>O</strong> jest w słowie, ale na złym miejscu.</div>
	<!-- Przykład 3: słowo "GRUZA" (gruza) -->
	<div class="row">
		<Tile value="g" state="🔳" />
		<Tile value="r" state="🔳" />
		<Tile value="u" state="⬛" />
		<Tile value="z" state="🔳" />
		<Tile value="y" state="🔳" />
	</div>
	<div>Litery <strong>U</strong> nie ma w słowie na żadnej pozycji.</div>
</div>
<div>
	To jest rekreacja oryginalnej gry <a
		href="https://www.nytimes.com/games/wordle/"
		target="_blank"
		rel="noreferrer">Wordle</a
	>
	autorstwa Josha Wardle'a z dodatkowymi trybami i funkcjami, pozwalająca grać nieskończoną liczbę razy. Przełącz się
	na tryb nieskończony, aby grać bez ograniczeń.
	<br /><br />
	Otwórz ustawienia, aby zobaczyć dodatkowe opcje.
	<br />
	Napisane w Svelte, w Typescript przez
	<a href="https://github.com/MikhaD" target="_blank" rel="noreferrer">MikhaD</a>.
	<br />
	Tłumaczenie oraz implementacja w discord
	<a href="https://github.com/konek101" target="_blank" rel="noreferrer">konek101</a>

</div>

<style lang="scss">
	div {
		margin: 14px 0;
	}
	.examples {
		border-top: 1px solid var(--border-primary);
		border-bottom: 1px solid var(--border-primary);
		:global(.row > *) {
			height: 100%;
			aspect-ratio: 1;
		}
		&:not(.complete) :global(.row .back) {
			transition-delay: 0.3s;
		}
	}
	.row {
		height: 40px;
		display: flex;
		gap: 4px;
	}
</style>
