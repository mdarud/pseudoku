# Pseudoku

A modern Sudoku puzzle solver and visualizer built with Svelte and TypeScript. This application demonstrates different algorithms for solving Sudoku puzzles, with step-by-step visualization and detailed explanations.

![Pseudoku Screenshot](screenshot.png)

## Features

- **Multiple Solving Algorithms**:
  - Dancing Links (DLX) - an efficient implementation of Algorithm X for exact cover problems
  - Bit Backtracking - optimized backtracking using bitwise operations
  - Simple Backtracking - traditional brute-force approach
  
- **Detailed Visualizations**:
  - Step-by-step solving mode
  - Cell-by-cell explanation of algorithm decisions
  - Visual representation of backtracking and constraint checking

- **Interactive Features**:
  - Manual puzzle solving
  - Automatic puzzle generation with different difficulty levels
  - Reset functionality to restart from the initial puzzle
  - Timer and statistics tracking

- **Educational Value**:
  - Detailed explanations of how each algorithm works
  - Visualization of constraint checks and backtracking
  - Comparison of different approaches to solving Sudoku

## Getting Started

### Prerequisites

- Node.js (v14+)
- npm or yarn

### Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/pseudoku.git
   cd pseudoku
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the development server:
   ```
   npm run dev
   ```

4. Open your browser and navigate to `http://localhost:5173`

## How to Use

1. **Generate a Puzzle**: Select a difficulty level and click "New Game"
2. **Solve It Yourself**: Click cells and use number buttons to fill in values
3. **Use the Solver**: Choose an algorithm and click "Solve" for automatic solving
4. **Step-by-Step**: Click "Step Mode" to see the algorithm work through the puzzle step by step
5. **Reset Puzzle**: Click "Reset Puzzle" to return to the initial state

## How It Works

### Dancing Links (DLX)

This algorithm, developed by Donald Knuth, represents Sudoku as an exact cover problem. It uses a sparse matrix representation with a doubly-linked list to efficiently remove and restore constraints during backtracking.

### Bit Backtracking

An optimized version of backtracking that uses bitwise operations to track used digits in rows, columns, and boxes. This significantly improves performance by reducing constraint checking to O(1) operations.

### Simple Backtracking

A traditional recursive backtracking approach that tries each possible value (1-9) for empty cells and backtracks when constraints are violated.

## Built With

- [Svelte](https://svelte.dev/) - Frontend framework
- [TypeScript](https://www.typescriptlang.org/) - Type safety
- [Vite](https://vitejs.dev/) - Development environment

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Donald Knuth for the Dancing Links algorithm
- The Sudoku community for inspiration and puzzle generation techniques
