import { SudokuSolver } from './solver';
import type { Board, DifficultyLevel } from './types';

interface DifficultyRange {
    min: number;
    max: number;
}

export class SudokuGenerator {
    private solver: SudokuSolver;
    private difficultyLevels: Record<DifficultyLevel, DifficultyRange>;

    constructor() {
        this.solver = new SudokuSolver();
        this.difficultyLevels = {
            easy: { min: 30, max: 35 },
            medium: { min: 35, max: 40 },
            hard: { min: 40, max: 45 },
            extreme: { min: 71, max: 77 }  // 81 - max/min filled cells (4-10 filled cells)
        };
    }

    generatePuzzle(difficulty: DifficultyLevel = 'medium'): { puzzle: Board; solution: Board } {
        const solution = this.generateFilledGrid();
        const puzzle = solution.map(row => [...row]);
        const cellsToRemove = this.getRandomInt(
            this.difficultyLevels[difficulty].min,
            this.difficultyLevels[difficulty].max
        );
        
        this.digHoles(puzzle, cellsToRemove);
        return { puzzle, solution };
    }

    private generateFilledGrid(): Board {
        const grid = Array(9).fill(0).map(() => Array(9).fill(0));
        for (let i of [0, 3, 6]) {
            this.fillBox(grid, i, i);
        }
        this.fillRemaining(grid, 0, 3);
        return grid;
    }

    private fillBox(grid: Board, row: number, col: number): void {
        const numbers = Array.from({ length: 9 }, (_, i) => i + 1);
        this.shuffleArray(numbers);
        
        let index = 0;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                grid[row + i][col + j] = numbers[index++];
            }
        }
    }

    private fillRemaining(grid: Board, i: number, j: number): boolean {
        if (j >= 9 && i < 8) {
            i = i + 1;
            j = 0;
        }
        if (i >= 9 && j >= 9) {
            return true;
        }
        if (i < 3) {
            if (j < 3) {
                j = 3;
            }
        } else if (i < 6) {
            if (j === Math.floor(i / 3) * 3) {
                j = j + 3;
            }
        } else {
            if (j === 6) {
                i = i + 1;
                j = 0;
                if (i >= 9) {
                    return true;
                }
            }
        }

        for (let num = 1; num <= 9; num++) {
            if (this.isSafe(grid, i, j, num)) {
                grid[i][j] = num;
                if (this.fillRemaining(grid, i, j + 1)) {
                    return true;
                }
                grid[i][j] = 0;
            }
        }
        return false;
    }

    private isSafe(grid: Board, row: number, col: number, num: number): boolean {
        for (let j = 0; j < 9; j++) {
            if (grid[row][j] === num) {
                return false;
            }
        }
        
        for (let i = 0; i < 9; i++) {
            if (grid[i][col] === num) {
                return false;
            }
        }
        
        const boxRow = Math.floor(row / 3) * 3;
        const boxCol = Math.floor(col / 3) * 3;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                if (grid[boxRow + i][boxCol + j] === num) {
                    return false;
                }
            }
        }
        
        return true;
    }

    private digHoles(grid: Board, holes: number): void {
        const positions = Array.from({ length: 81 }, (_, i) => [
            Math.floor(i / 9),
            i % 9
        ] as [number, number]);
        
        this.shuffleArray(positions);
        
        let holesRemaining = holes;
        for (const [row, col] of positions) {
            if (holesRemaining <= 0) break;
            
            const backup = grid[row][col];
            grid[row][col] = 0;
            
            const boardCopy = grid.map(row => [...row]);
            this.solver.setBoard(boardCopy);
            
            if (this.solver.solve()) {
                holesRemaining--;
            } else {
                grid[row][col] = backup;
            }
        }
    }

    private shuffleArray<T>(array: T[]): void {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
    }

    private getRandomInt(min: number, max: number): number {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }

    getDifficultyLevels(): DifficultyLevel[] {
        return Object.keys(this.difficultyLevels) as DifficultyLevel[];
    }
} 