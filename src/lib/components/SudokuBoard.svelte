<script lang="ts">
    import SudokuCell from './SudokuCell.svelte';
    import type { Board } from '../types';

    export let board: Board;
    export let originalBoard: Board;
    export let highlightedCell: [number, number] | null = null;
    export let selectedCell: [number, number] | null = null;
    export let solvingCell: [number, number] | null = null;
    export let onCellClick: (row: number, col: number) => void;

    let conflictingCells: [number, number][] = [];

    $: isOriginal = (row: number, col: number) => originalBoard[row][col] !== 0;
    $: isHighlighted = (row: number, col: number) => 
        highlightedCell !== null && row === highlightedCell[0] && col === highlightedCell[1];
    $: isSelected = (row: number, col: number) =>
        selectedCell !== null && row === selectedCell[0] && col === selectedCell[1];
    $: isSolving = (row: number, col: number) =>
        solvingCell !== null && row === solvingCell[0] && col === solvingCell[1];
    $: isAlternateBox = (row: number, col: number) => {
        const boxRow = Math.floor(row / 3);
        const boxCol = Math.floor(col / 3);
        return (boxRow + boxCol) % 2 === 1;
    };

    function updateConflicts(conflicts: [number, number][]) {
        conflictingCells = conflicts;
    }
</script>

<div style="display: inline-block; background: linear-gradient(135deg, #4f46e5, #2563eb); border-radius: 0.75rem; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3); padding: 0.625rem;">
    <div style="background-color: #1f2937; border-radius: 0.5rem; overflow: hidden; box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.3);">
        <div style="display: flex; flex-direction: column; border: 2px solid #6366f1; width: fit-content; border-radius: 4px; overflow: hidden;">
            {#each board as row, i}
                <div style="display: flex;">
                    {#each row as cell, j}
                        <div style="width: 48px; height: 48px; border-right: 1px solid #4b5563; border-bottom: 1px solid #4b5563; padding: 0; margin: 0; position: relative; {i === 0 ? 'border-top: none;' : ''} {j === 0 ? 'border-left: none;' : ''} {(j + 1) % 3 === 0 ? 'border-right: 2px solid #6366f1;' : ''} {(i + 1) % 3 === 0 ? 'border-bottom: 2px solid #6366f1;' : ''} {j === 8 ? 'border-right: none;' : ''} {i === 8 ? 'border-bottom: none;' : ''}">
                            <SudokuCell
                                value={cell}
                                row={i}
                                col={j}
                                isHighlighted={isHighlighted(i, j)}
                                isSelected={isSelected(i, j)}
                                isOriginal={isOriginal(i, j)}
                                isAlternateBox={isAlternateBox(i, j)}
                                isSolving={isSolving(i, j)}
                                conflictsWith={conflictingCells}
                                onCellClick={onCellClick}
                                {board}
                                on:conflicts={(e) => updateConflicts(e.detail)}
                            />
                        </div>
                    {/each}
                </div>
            {/each}
        </div>
    </div>
</div>

<style>
    /* Keep this minimal since we're using inline styles */
    @media (min-width: 768px) {
        div[style*="width: 48px"] {
            width: 54px !important;
            height: 54px !important;
        }
    }

    @media (min-width: 1024px) {
        div[style*="width: 48px"] {
            width: 60px !important;
            height: 60px !important;
        }
    }
</style> 