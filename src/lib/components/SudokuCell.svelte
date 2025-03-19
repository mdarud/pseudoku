<script lang="ts">
    import { createEventDispatcher } from 'svelte';
    const dispatch = createEventDispatcher();

    export let value: number;
    export let row: number;
    export let col: number;
    export let isHighlighted: boolean;
    export let isSelected: boolean;
    export let isOriginal: boolean;
    export let isAlternateBox: boolean;
    export let isSolving: boolean = false;
    export let onCellClick: (row: number, col: number) => void;
    export let board: number[][];
    export let conflictsWith: [number, number][] = [];

    $: isInvalid = value !== 0 && !isValidMove(row, col, value);
    $: hasConflict = conflictsWith.some(([r, c]) => r === row && c === col);
    $: isConflictSource = value !== 0 && hasConflict;
    $: isConflictRelated = !isConflictSource && conflictsWith.some(([r, c]) => r === row && c === col);

    function getConflictingCells(row: number, col: number, num: number): [number, number][] {
        if (num === 0) return [];
        const conflicts: [number, number][] = [];

        // Check row
        for (let j = 0; j < 9; j++) {
            if (j !== col && board[row][j] === num) {
                conflicts.push([row, j]);
            }
        }

        // Check column
        for (let i = 0; i < 9; i++) {
            if (i !== row && board[i][col] === num) {
                conflicts.push([i, col]);
            }
        }

        // Check box
        const boxRow = Math.floor(row / 3) * 3;
        const boxCol = Math.floor(col / 3) * 3;
        for (let i = boxRow; i < boxRow + 3; i++) {
            for (let j = boxCol; j < boxCol + 3; j++) {
                if ((i !== row || j !== col) && board[i][j] === num) {
                    conflicts.push([i, j]);
                }
            }
        }

        return conflicts;
    }

    function isValidMove(row: number, col: number, num: number): boolean {
        return getConflictingCells(row, col, num).length === 0;
    }

    $: if (value !== 0 && !isOriginal) {
        const conflicts = getConflictingCells(row, col, value);
        if (conflicts.length > 0) {
            conflicts.push([row, col]);
            dispatch('conflicts', conflicts);
            conflictsWith = conflicts;
        } else {
            dispatch('conflicts', []);
            conflictsWith = [];
        }
    }
</script>

<button
    style="
        width: 100%;
        height: 100%;
        font-size: 1.25rem;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        transition: all 0.2s ease;
        padding: 0;
        margin: 0;
        min-width: 48px;
        min-height: 48px;
        border: none;
        cursor: {isOriginal ? 'not-allowed' : 'pointer'};
        color: {isOriginal ? 'white' : '#93c5fd'};
        background-color: {
            isConflictSource ? '#7f1d1d' : 
            isConflictRelated ? '#991b1b' : 
            isSolving ? '#064e3b' : 
            isSelected ? '#312e81' : 
            isHighlighted ? '#065f46' : 
            isAlternateBox ? '#1e3a8a' : '#111827'
        };
        {isSelected ? 'box-shadow: 0 0 0 2px #4f46e5;' : ''}
        {isHighlighted ? 'box-shadow: 0 0 0 2px #10b981;' : ''}
        {isSolving ? 'animation: solving-animation 0.8s ease-in-out infinite;' : ''}
        {isConflictSource ? 'animation: conflict-source-animation 1s ease-in-out infinite;' : ''}
        {isConflictRelated ? 'animation: conflict-related-animation 1s ease-in-out infinite;' : ''}
    "
    on:click={() => onCellClick(row, col)}
    disabled={isOriginal}
>
    <span style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;">
        {#if value !== 0}
            {value}
        {:else}
            &nbsp;
        {/if}
    </span>
</button>

<style>
    button:hover:not(:disabled) {
        transform: scale(1.05);
    }

    @keyframes solving-animation {
        0% { background-color: #064e3b; box-shadow: 0 0 5px rgba(16, 185, 129, 0.2); }
        50% { background-color: #065f46; box-shadow: 0 0 10px rgba(16, 185, 129, 0.4); }
        100% { background-color: #064e3b; box-shadow: 0 0 5px rgba(16, 185, 129, 0.2); }
    }

    @keyframes conflict-source-animation {
        0% { background-color: #7f1d1d; box-shadow: 0 0 0 2px #dc2626; }
        50% { background-color: #991b1b; box-shadow: 0 0 0 3px #f87171; transform: scale(1.05); }
        100% { background-color: #7f1d1d; box-shadow: 0 0 0 2px #dc2626; }
    }

    @keyframes conflict-related-animation {
        0% { background-color: #991b1b; transform: scale(1); }
        50% { background-color: #b91c1c; transform: scale(1.02); }
        100% { background-color: #991b1b; transform: scale(1); }
    }

    @media (min-width: 768px) {
        button {
            min-width: 54px !important;
            min-height: 54px !important;
            font-size: 1.3rem;
        }
    }

    @media (min-width: 1024px) {
        button {
            min-width: 60px !important;
            min-height: 60px !important;
            font-size: 1.5rem;
        }
    }
</style> 