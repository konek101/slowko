<script  lang="ts">
    import type { PlayerData } from '../../types';
    /**
     * Multiplayer widget
     * Displays currently connected players using the Player module.
     *
     * Adjust the import path below to your actual Player store / module.
     * Expected: a readable store `playersStore` (or adapt) with array of:
     * { id: string; name: string; avatar?: string; status?: string }
     */
    import Player from './Player.svelte';

    export let playerData: PlayerData[];
    //duplicate playerdata to spoof more players for testing
    const duplicatedPlayerData = [...playerData, ...playerData];
    playerData = duplicatedPlayerData;

</script>

<div class="mp-container" aria-label="Connected players">
    <header class="mp-header">
        <span class="mp-title">Players</span>
        <span class="mp-count" aria-live="polite">{playerData.length}</span>
    </header>

    {#if playerData.length === 0}
        <div class="mp-empty">No players connected</div>
    {:else}
        <ul class="mp-list">
            {#each playerData as player}
                <li class="mp-item">
                    <Player {...player} />
            {/each}
        </ul>
    {/if}
</div>

<style>
    .mp-container {
        position: absolute;
        top: 3rem;
        left: 0.5rem;
        /* Much narrower sidebar */
        width: clamp(210px, 24vw, 300px);
        max-width: min(300px, calc(100vw - 1rem));
        padding: 0.4rem 0.45rem 0.45rem;
        background: rgba(24,24,28,0.78);
        backdrop-filter: blur(6px);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 10px;
        font-family: system-ui, sans-serif;
        color: #f5f7fa;
        box-shadow: 0 4px 16px -4px rgba(0,0,0,0.4);
        /* Allow vertical scroll if content exceeds viewport height minus some offset */
        max-height: calc(100vh - 4rem);
        overflow-y: auto;
        overflow-x: hidden;
    }

    .mp-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        font-size: 0.78rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        margin-bottom: 0.35rem;
        color: #cdd3dd;
    }

    .mp-title { pointer-events: none; }

    .mp-count {
        background: #2d3542;
        color: #dfe5ee;
        padding: 0 0.4rem;
        border-radius: 5px;
        font-size: 0.65rem;
        font-weight: 500;
        line-height: 1.2rem;
        min-width: 1.2rem;
        text-align: center;
    }

    .mp-empty {
        font-size: 0.72rem;
        padding: 0.35rem 0.1rem 0.1rem;
        opacity: 0.6;
    }

    .mp-list {
        margin: 0;
        padding: 0;
        list-style: none;
        display: grid;
        /* Force mostly single column in narrow width */
        grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
        gap: 0.4rem 0.45rem;
        align-items: start;
        max-height: none;
        grid-auto-flow: row dense;
    }

    /* Scrollbar aesthetics */
    .mp-container::-webkit-scrollbar { width: 6px; }
    .mp-container::-webkit-scrollbar-track { background: transparent; }
    .mp-container::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.15); border-radius: 4px; }
    .mp-container:hover::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.28); }

    .mp-item {
        display: flex;
        align-items: stretch;
    }

    /* Ensure internal Player stretches to column width */
    .mp-item > :global(.player) { width: 100%; min-width: 0; }
    /* Compact overrides */
    .mp-item > :global(.player.compact) {
        font-size: 11px;
        gap: 0.25rem;
    }
    .mp-item > :global(.player.compact .header) {
        gap: 0.35rem;
        min-height: 26px;
    }
    .mp-item > :global(.player.compact .avatar) {
        width: 22px;
        height: 22px;
        border-radius: 50%;
    }
    .mp-item > :global(.player.compact .name) {
        max-width: 90px;
        font-size: 0.65rem;
        line-height: 1.1;
    }
    .mp-item > :global(.player.compact .board) { gap: 2px; }
    .mp-item > :global(.player.compact .row) { gap: 2px; }
    .mp-item > :global(.player.compact .cell) {
        width: 14px;
        height: 14px;
        border-radius: 3px;
        box-shadow: 0 0 0 1px #333 inset;
    }
    /* Tiny variant adds board scale to shrink further without rewriting Board */
    .mp-item > :global(.player.tiny .board) {
        transform: scale(.34);
        transform-origin: top left;
    }
    .mp-item > :global(.player.tiny) { gap: 0.15rem; }
    .mp-item > :global(.player.tiny .avatar) { width: 16px; height: 16px; }
    .mp-item > :global(.player.tiny .name) { font-size: 0.58rem; max-width: 64px; }

    @media (max-width: 640px) {
        .mp-container {
            top: 0.4rem;
            left: 0.4rem;
            width: calc(100vw - 0.8rem);
            padding: 0.5rem 0.55rem 0.6rem;
        }
        .mp-list {
            grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
            gap: 0.35rem 0.4rem;
        }
        .mp-item > :global(.player.compact .cell) { width: 11px; height: 11px; }
        .mp-item > :global(.player.tiny .board) { transform: scale(.32); }
    }

    /* Wider desktop: allow a second column more easily but still cap to avoid covering main board */
    @media (min-width: 1400px) {
    .mp-container { width: clamp(240px, 22vw, 380px); }
    .mp-list { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); }
    .mp-item > :global(.player.tiny .board) { transform: scale(.36); }
    }
</style>