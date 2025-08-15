<script context="module" lang="ts">
	const tips = [
		"Możesz zmienić tryb gry klikając Słówko lub przesuwając planszę w lewo lub w prawo.",
		"Tryb trudny jest specyficzny dla trybu gry. Włączenie go w jednym trybie nie zmienia go w innych.",
		"Kliknij dwukrotnie lub użyj prawego przycisku myszy na słowie na planszy, aby poznać jego definicję.",
		"Tryb trudny można włączyć w trakcie gry, jeśli nie złamałeś jeszcze zasad trybu trudnego.",
		"Kliknij dwukrotnie lub użyj prawego przycisku myszy na następnym wierszu, aby zobaczyć ile słów można tam wpisać, korzystając z dotychczasowych podpowiedzi.",
		"Ponieważ słowa są wybierane losowo z listy, możliwe jest trafienie na to samo słowo ponownie.",
		"Gdy zobaczysz przycisk odświeżania w lewym górnym rogu, oznacza to, że czeka nowe słowo.",
		"Każdy ma to samo słowo w tym samym czasie. Twoje słowo nr 73 jest takie samo jak u innych.",
		"Jest więcej poprawnych zgadywanek niż możliwych słów do odgadnięcia, tzn. nie każde 5-literowe słowo może być odpowiedzią.",
		"Gry historyczne nie liczą się do statystyk. Gra historyczna to taka, do której prowadzi link z konkretnym numerem.",
		"Tylko dane z ostatniej gry historycznej są zapisywane dla każdego trybu.",
	];
</script>

<script lang="ts">
	export let change: boolean;
	let index = Math.floor(tips.length * Math.random());
	$: if (change) index = Math.floor(tips.length * Math.random());

	function nextTip() {
		index = (index + 1) % tips.length;
	}
	function previousTip() {
		index = (index - 1 + tips.length) % tips.length;
	}
</script>

<div class="outer">
	<div class="number">Porada {index + 1}/{tips.length}</div>
	<div class="tip">{tips[index]}</div>
	<svg
		class="left"
		on:click={previousTip}
		on:keydown={previousTip}
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 100 100"
	>
		<path d="M75,0L25,50L75,100z" />
	</svg>
	<svg
		on:click={nextTip}
		on:keypress={nextTip}
		class="right"
		xmlns="http://www.w3.org/2000/svg"
		viewBox="0 0 100 100"
	>
		<path d="M25,0L75,50L25,100z" />
	</svg>
</div>

<style lang="scss">
	.outer {
		margin: 15px auto;
		padding: 10px 20px;
		max-width: calc(0.6 * var(--game-width));
		border: solid 1px var(--border-secondary);
		background: var(--bg-secondary);
		border-radius: 4px;
		position: relative;
	}
	.number {
		text-align: center;
		font-weight: bold;
		font-size: 1.2em;
		margin-bottom: 10px;
	}
	.left,
	.right {
		cursor: pointer;
		position: absolute;
		border-radius: 4px;
		background: var(--fg-primary);
		fill: var(--bg-primary);
		height: 45px;
		padding: 10px 0;
		top: 50%;
	}
	.left {
		left: 0;
		transform: translate(-50%, -50%);
	}
	.right {
		right: 0;
		transform: translate(50%, -50%);
	}
	.tip {
		text-align: center;
		min-height: 70px;
	}
</style>
