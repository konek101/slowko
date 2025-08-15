<script context="module" lang="ts">
	const cache = new Map<string, Promise<DictionaryEntry>>();
</script>

<script lang="ts">
    import type { DictionaryEntry } from "../../types";

	export let word: string;
	/** The maximum number of alternate definitions to provide*/
	export let alternates = 9;
	async function getWordData(word: string): Promise<DictionaryEntry> {
		if (!cache.has(word)) {
			const data = await fetch(`/api/definition/${word}`);
			if (data.ok) {
				const json = await data.json();
				const definitions = json.definitions
				const entry: DictionaryEntry = {
					word: word,
					phonetic: "",
					phonetics: [],
					origin: "",
					meanings: [{
						partOfSpeech: "",
						definitions: definitions.map((def: string) => ({
							definition: def,
							synonyms: [],
							antonyms: [],
						})),
					}],
				};
				cache.set(word, Promise.resolve(entry));
			} else {
				throw new Error(`Failed to fetch definition`);
			}
		return cache.get(word);
		}
	}
	async function getENWordData(word: string): Promise<DictionaryEntry> {
		if (!cache.has(word)) {
			const data = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${word}`, {
				mode: "cors",
			});
			if (data.ok) {
				cache.set(word, (await data.json())[0]);
			} else {
				throw new Error(`Failed to fetch definition`);
			}
		}
		return cache.get(word);
	}
</script>

<div class="def">
	{#await getWordData(word)}
		<h4>Pobieranie definicji...</h4>
	{:then data}
		<h2>{word}</h2>
		<ol>
			{#if word !== data.word}
							<li>wariant słowa {data.word}.</li>
			{/if}
			{#each data.meanings[0].definitions as def}
				<li>{def.definition}</li>
			{/each}
		</ol>
	{:catch}
		<div>Twoje słowo to <strong>{word}</strong>. (nie udało się pobrać definicji)</div>
	{/await}
</div>

<style>
	h2 {
		display: inline-block;
		margin-right: 1rem;
		margin-bottom: 0.8rem;
	}
	ol {
		padding-left: 1.5rem;
	}
	li {
		margin-bottom: 0.5rem;
	}
	li::first-letter {
		text-transform: uppercase;
	}
	li::marker {
		color: var(--fg-secondary);
	}
</style>
