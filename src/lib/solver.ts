import type { Board, Position, SolutionStep } from './types';

/**
 * Statistics about the solver's performance.
 */
export type SolverStats = {
    algorithm: string;
    timeMs: number;
    steps: number;
};

/**
 * Represents a single step in the solving process.
 */
export type SolverStep = {
    row: number;
    col: number;
    testedValues: number[];
    finalValue: number;
};

/**
 * Available solver algorithms.
 */
export enum SolverAlgorithm {
    DLX = 'Dancing Links (DLX)',
    BACKTRACK = 'Backtracking with Bit Operations',
    SIMPLE = 'Simple Backtracking'
}

/**
 * DLX Node structure for sparse matrix representation.
 * Each node has connections in 4 directions plus a reference to its column.
 */
class DLXNode {
    left: DLXNode;
    right: DLXNode;
    up: DLXNode;
    down: DLXNode;
    column: ColumnNode;
    row: number;
    col: number;
    num: number;
    
    constructor(column: ColumnNode) {
        this.left = this;
        this.right = this;
        this.up = this;
        this.down = this;
        this.column = column;
        this.row = 0;
        this.col = 0;
        this.num = 0;
    }
}

/**
 * Column header node with additional metadata.
 * Extends DLXNode with size tracking and a name.
 */
class ColumnNode extends DLXNode {
    size: number;
    name: string;
    
    constructor(name: string) {
        super(null as any);
        this.size = 0;
        this.name = name;
        this.column = this;
    }
}

/**
 * Sudoku solver implementing multiple algorithms.
 * - Dancing Links (DLX): Knuth's Algorithm X for exact cover problems
 * - Backtracking with Bit Operations: Fast backtracking using bit manipulation
 * - Simple Backtracking: Basic recursive backtracking algorithm
 */
export class SudokuSolver {
    private board: Board;
    private solutionSteps: SolverStep[];
    private header: ColumnNode;
    private columns: ColumnNode[];
    private rows: Uint16Array;
    private cols: Uint16Array;
    private boxes: Uint16Array;
    private static readonly ALL_NUMS = 0b1111111110; // Bits 1-9 set
    private stats: SolverStats;
    private currentTestedValues: number[];

    constructor() {
        this.board = Array(9).fill(0).map(() => Array(9).fill(0));
        this.solutionSteps = [];
        this.header = new ColumnNode('header');
        this.columns = [];
        this.rows = new Uint16Array(9);
        this.cols = new Uint16Array(9);
        this.boxes = new Uint16Array(9);
        this.stats = { algorithm: '', timeMs: 0, steps: 0 };
        this.currentTestedValues = [];
    }

    /**
     * Sets the board to solve.
     */
    setBoard(board: Board): void {
        this.board = board.map(row => [...row]);
        this.solutionSteps = [];
    }

    // ============================================================================
    // Dancing Links (DLX) Implementation
    // ============================================================================

    /**
     * Creates the exact cover matrix for DLX.
     * The matrix has 324 columns representing all constraints:
     * - 81 cell constraints (each cell must be filled)
     * - 81 row constraints (each number must appear once in each row)
     * - 81 column constraints (each number must appear once in each column)
     * - 81 box constraints (each number must appear once in each 3x3 box)
     */
    private createMatrix(): void {
        this.header = new ColumnNode('header');
        this.columns = [];
        
        // Create all 324 column headers
        for (let i = 0; i < 324; i++) {
            const col = new ColumnNode(`C${i}`);
            this.columns.push(col);
            col.left = this.header.left;
            col.right = this.header;
            this.header.left.right = col;
            this.header.left = col;
        }

        // Add rows for each cell
        for (let row = 0; row < 9; row++) {
            for (let col = 0; col < 9; col++) {
                const value = this.board[row][col];
                if (value === 0) {
                    // If cell is empty, add all possible numbers
                    for (let num = 1; num <= 9; num++) {
                        this.addRow(row, col, num);
                    }
                } else {
                    // If cell is filled, add only that number
                    this.addRow(row, col, value);
                }
            }
        }
    }

    /**
     * Adds a row to the DLX matrix for a given cell and number.
     * Each row has 4 nodes representing the 4 constraints that a number in a cell satisfies.
     */
    private addRow(row: number, col: number, num: number): void {
        const box = Math.floor(row / 3) * 3 + Math.floor(col / 3);
        const cell = row * 9 + col;
        const rowNum = row * 9 + (num - 1);
        const colNum = col * 9 + (num - 1);
        const boxNum = box * 9 + (num - 1);
        
        const nodes: DLXNode[] = [
            this.addNode(this.columns[cell], row, col, num),
            this.addNode(this.columns[81 + rowNum], row, col, num),
            this.addNode(this.columns[162 + colNum], row, col, num),
            this.addNode(this.columns[243 + boxNum], row, col, num)
        ];
        
        // Link nodes horizontally in a circular fashion
        for (let i = 0; i < 4; i++) {
            const next = (i + 1) % 4;
            nodes[i].right = nodes[next];
            nodes[next].left = nodes[i];
        }
    }

    /**
     * Adds a node to a column in the DLX matrix.
     */
    private addNode(column: ColumnNode, row: number, col: number, num: number): DLXNode {
        const node = new DLXNode(column);
        node.row = row;
        node.col = col;
        node.num = num;
        
        // Insert the node at the bottom of its column
        node.up = column.up;
        node.down = column;
        column.up.down = node;
        column.up = node;
        
        column.size++;
        return node;
    }

    /**
     * Covers a column in the DLX matrix by removing it and all rows that have a 1 in this column.
     */
    private cover(column: ColumnNode): void {
        // Remove the column from the header list
        column.right.left = column.left;
        column.left.right = column.right;

        // For each row in this column
        for (let row = column.down; row !== column; row = row.down) {
            // For each node in this row, remove it from its column
            for (let right = row.right; right !== row; right = right.right) {
                right.down.up = right.up;
                right.up.down = right.down;
                right.column.size--;
            }
        }
    }

    /**
     * Uncovers a column in the DLX matrix, restoring it and all affected rows.
     */
    private uncover(column: ColumnNode): void {
        // For each row in this column (bottom to top)
        for (let row = column.up; row !== column; row = row.up) {
            // For each node in this row, restore it to its column
            for (let left = row.left; left !== row; left = left.left) {
                left.column.size++;
                left.down.up = left;
                left.up.down = left;
            }
        }
        // Restore the column to the header list
        column.right.left = column;
        column.left.right = column;
    }

    /**
     * Solves the Sudoku using the Dancing Links algorithm.
     */
    private solveDLX(): boolean {
        this.createMatrix();
        return this.searchDLX(0);
    }

    /**
     * Recursive search function for the DLX algorithm.
     */
    private searchDLX(k: number): boolean {
        // If no columns remain, we've found a solution
        if (this.header.right === this.header) {
            return true;
        }

        // Choose the column with the fewest nodes (MRV heuristic)
        let minColumn = this.header.right as ColumnNode;
        let minSize = minColumn.size;
        
        for (let col = minColumn.right as ColumnNode; col !== this.header; col = col.right as ColumnNode) {
            if (col.size < minSize) {
                minSize = col.size;
                minColumn = col;
                if (minSize === 1) break; // Optimization: no need to look further if we find a column with size 1
            }
        }

        // If the column has no nodes, this branch has no solution
        if (minSize === 0) return false;
        
        this.cover(minColumn);
        this.currentTestedValues = [];

        // Try each row in the selected column
        for (let row = minColumn.down; row !== minColumn; row = row.down) {
            // Skip if this would overwrite a non-zero value with a different value
            if (this.board[row.row][row.col] !== 0 && this.board[row.row][row.col] !== row.num) {
                continue;
            }

            this.currentTestedValues.push(row.num);

            // Cover all columns that have a 1 in this row
            for (let right = row.right; right !== row; right = right.right) {
                this.cover(right.column);
            }

            // If this is a new value being placed, record it as a solution step
            if (this.board[row.row][row.col] === 0) {
                this.solutionSteps.push({
                    row: row.row,
                    col: row.col,
                    testedValues: [...this.currentTestedValues],
                    finalValue: row.num
                });
            }
            this.board[row.row][row.col] = row.num;

            // Recursively search
            if (this.searchDLX(k + 1)) {
                    return true;
                }

            // If we get here, this branch didn't work; backtrack
            if (this.board[row.row][row.col] === row.num) {
                this.board[row.row][row.col] = 0;
                if (this.solutionSteps.length > 0) {
                this.solutionSteps.pop();
                }
            }

            // Uncover all columns that were covered in this branch
            for (let left = row.left; left !== row; left = left.left) {
                this.uncover(left.column);
            }
        }

        // None of the rows worked, backtrack
        this.uncover(minColumn);
        return false;
    }

    // ============================================================================
    // Backtracking with Bit Operations Implementation
    // ============================================================================

    /**
     * Initializes bit arrays for efficient constraint checking.
     */
    private initializeBitArrays(): void {
        this.rows.fill(0);
        this.cols.fill(0);
        this.boxes.fill(0);

        // Set bits for numbers already on the board
        for (let row = 0; row < 9; row++) {
            for (let col = 0; col < 9; col++) {
                const num = this.board[row][col];
                if (num !== 0) {
                    const bit = 1 << num;
                    const box = Math.floor(row / 3) * 3 + Math.floor(col / 3);
                    this.rows[row] |= bit;
                    this.cols[col] |= bit;
                    this.boxes[box] |= bit;
                }
            }
        }
    }

    /**
     * Gets the valid numbers for a cell as a bitmask.
     */
    private getValidNumbers(row: number, col: number): number {
        const box = Math.floor(row / 3) * 3 + Math.floor(col / 3);
        const used = this.rows[row] | this.cols[col] | this.boxes[box];
        return SudokuSolver.ALL_NUMS & ~used;
    }

    /**
     * Solves the Sudoku using backtracking with bit operations.
     */
    private solveBacktrack(): boolean {
        this.initializeBitArrays();
        return this.searchBacktrack();
    }

    /**
     * Recursive search function for the backtracking with bit operations algorithm.
     */
    private searchBacktrack(): boolean {
        // Find the first empty cell
        for (let row = 0; row < 9; row++) {
            for (let col = 0; col < 9; col++) {
                if (this.board[row][col] === 0) {
                    const validNums = this.getValidNumbers(row, col);
                    let nums = validNums;
                    this.currentTestedValues = [];

                    // Try each valid number
                    while (nums) {
                        const num = nums & -nums; // Extract the lowest set bit
                        nums &= ~num; // Remove this bit from the set
                        const value = Math.log2(num);
                        this.currentTestedValues.push(value);
                        
                        // Set the bit in constraints
                        const box = Math.floor(row / 3) * 3 + Math.floor(col / 3);
                        this.rows[row] |= num;
                        this.cols[col] |= num;
                        this.boxes[box] |= num;
                        this.board[row][col] = value;
                        
                        // Record this step
                        this.solutionSteps.push({
                            row,
                            col,
                            testedValues: [...this.currentTestedValues],
                            finalValue: value
                        });

                        // Recursively search
                        if (this.searchBacktrack()) {
                            return true;
                        }

                        // Backtrack
                        this.rows[row] &= ~num;
                        this.cols[col] &= ~num;
                        this.boxes[box] &= ~num;
                        this.board[row][col] = 0;
                        this.solutionSteps.pop();
                    }
                    return false; // No valid number worked
                }
            }
        }
        return true; // All cells are filled
    }

    // ============================================================================
    // Simple Backtracking Implementation
    // ============================================================================

    /**
     * Checks if a number can be placed in a cell without conflicts.
     */
    private isValid(row: number, col: number, num: number): boolean {
        // Check row
        for (let x = 0; x < 9; x++) {
            if (this.board[row][x] === num) return false;
        }

        // Check column
        for (let x = 0; x < 9; x++) {
            if (this.board[x][col] === num) return false;
        }

        // Check 3x3 box
        const boxRow = Math.floor(row / 3) * 3;
        const boxCol = Math.floor(col / 3) * 3;
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                if (this.board[boxRow + i][boxCol + j] === num) return false;
            }
        }

        return true;
    }

    /**
     * Solves the Sudoku using simple backtracking.
     */
    private solveSimple(): boolean {
        // Find the first empty cell
        for (let row = 0; row < 9; row++) {
            for (let col = 0; col < 9; col++) {
                if (this.board[row][col] === 0) {
                    this.currentTestedValues = [];
                    
                    // Try each number 1-9
                    for (let num = 1; num <= 9; num++) {
                        this.currentTestedValues.push(num);
                        if (this.isValid(row, col, num)) {
                            this.board[row][col] = num;
                            
                            // Record this step
                            this.solutionSteps.push({
                                row,
                                col,
                                testedValues: [...this.currentTestedValues],
                                finalValue: num
                            });

                            // Recursively search
                            if (this.solveSimple()) {
                                return true;
                            }

                            // Backtrack
                            this.board[row][col] = 0;
                            this.solutionSteps.pop();
                        }
                    }
                    return false; // No number worked
                }
            }
        }
        return true; // All cells are filled
    }

    // ============================================================================
    // Public Methods
    // ============================================================================

    /**
     * Solves the Sudoku puzzle using the specified algorithm.
     * @returns Statistics about the solving process
     */
    solve(algorithm: SolverAlgorithm = SolverAlgorithm.DLX): SolverStats {
        this.solutionSteps = [];
        
        // Force any pending operations to complete
        performance.mark('solveStart');
        
        let success: boolean;
        switch (algorithm) {
            case SolverAlgorithm.DLX:
                success = this.solveDLX();
                break;
            case SolverAlgorithm.BACKTRACK:
                success = this.solveBacktrack();
                break;
            case SolverAlgorithm.SIMPLE:
                success = this.solveSimple();
                break;
            default:
                success = this.solveDLX();
        }

        performance.mark('solveEnd');
        performance.measure('solveDuration', 'solveStart', 'solveEnd');
        const duration = performance.getEntriesByName('solveDuration').pop();
        
        this.stats = {
            algorithm: algorithm,
            timeMs: duration ? duration.duration : 0,
            steps: this.solutionSteps.length
        };

        // Cleanup performance marks
        performance.clearMarks();
        performance.clearMeasures();

        return this.stats;
    }

    /**
     * Gets the current solution board.
     */
    getSolution(): Board {
        return this.board.map(row => [...row]);
    }

    /**
     * Gets the steps taken to solve the puzzle.
     */
    getSolutionSteps(): SolverStep[] {
        return [...this.solutionSteps];
    }

    /**
     * Gets the statistics from the last solve operation.
     */
    getStats(): SolverStats {
        return { ...this.stats };
    }
} 