<script lang="ts">
    import { mode, wordLength } from "../../stores";
    import type { GameBoard, LetterState } from "../../types";
    import { GameState, modeData, ROWS } from "../../utils";
    import Board from "../board/Board.svelte";

    // Props
    export let id: string;
    export let name: string;
    export let avatar: string;
    export let gameState: GameState;
    const board: GameBoard = gameState.board;
    const letterState: LetterState[][] = board.state;
    const newBoard: GameBoard = {
        state: letterState,
        words: Array.from({ length: ROWS }, (_, i) => ''),
    };

</script>

<div class="player">
    <div class="header">
        {#if avatar}
            <img class="avatar" src={avatar} alt="{name} avatar" style="border-radius:50%;" />
        {:else}
            <div class="avatar placeholder" aria-hidden="true">{name.slice(0,1).toUpperCase()}</div>
        {/if}
        <div class="name" title={name}>{name}</div>
    </div>

    <div class="board" role="grid" aria-label="{name} board progress">
        <main class:guesses={gameState.guesses !== 0} style="--rows: {ROWS}; --cols: {$wordLength+4}">
            <Board value={newBoard.words} board={newBoard} guesses={gameState.guesses} icon={modeData.modes[$mode].icon} tutorial={false} />
        </main>
    </div>
</div>

<style>
    .player {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        font: 14px/1.2 system-ui, sans-serif;
    }

    .header {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        min-height: 40px;
    }

    .avatar {
        width: 40px;
        height: 40px;
        border-radius: 8px;
        object-fit: cover;
        background: #2b2f33;
    }
    .avatar.placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        color: #eee;
        background: #444;
    }

    .name {
        font-weight: 600;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 180px;
    }

    .board {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .row {
        display: flex;
        gap: 4px;
    }

    .cell {
        width: 38px;
        height: 38px;
        border-radius: 4px;
        background: var(--color-empty, #d3d6da);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        user-select: none;
        /* Hide letter content (we don't render it; color kept for future) */
        color: transparent;
        position: relative;
        box-shadow: 0 0 0 1px #ccc inset;
    }

    /* States */
    .cell.correct  { background: var(--color-correct, #6aaa64); color: transparent; }
    .cell.present  { background: var(--color-present, #c9b458); color: transparent; }
    .cell.absent   { background: var(--color-absent, #787c7e);  color: transparent; }
    .cell.empty    { background: var(--color-empty, #d3d6da);   color: transparent; }
    .cell.unknown  { background: #999; }

    /* Optional subtle animation when states appear */
    .cell.correct,
    .cell.present,
    .cell.absent {
        animation: pop 160ms ease;
    }
    @keyframes pop {
        0% { transform: scale(.8); }
        100% { transform: scale(1); }
    }
</style>