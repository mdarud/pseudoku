<script lang="ts">
  import { onMount } from 'svelte';
  import SudokuBoard from './lib/components/SudokuBoard.svelte';
  import { SudokuGenerator } from './lib/generator';
  import { SudokuSolver, SolverAlgorithm, type SolverStep } from './lib/solver';
  import type { Board, DifficultyLevel } from './lib/types';

  let board: Board = Array(9).fill(0).map(() => Array(9).fill(0));
  let originalBoard: Board = Array(9).fill(0).map(() => Array(9).fill(0));
  let solution: Board | null = null;
  let selectedCell: [number, number] | null = null;
  let highlightedCell: [number, number] | null = null;
  let generator: SudokuGenerator;
  let solver: SudokuSolver;
  let difficulty: DifficultyLevel = 'medium';
  let showingSolution = false;
  let isSolving = false;
  let selectedAlgorithm: SolverAlgorithm = SolverAlgorithm.DLX;
  let solverStats: { timeMs: number, steps: number } | null = null;
  let currentStep = -1;
  let solutionSteps: SolverStep[] = [];
  let isStepMode = false;
  
  // Timer and statistics
  let startTime: number | null = null;
  let elapsedTime = 0;
  let timerInterval: number;
  let isPaused = false;
  let pauseStartTime: number | null = null;
  let gamesPlayed = 0;
  let bestTimes: Record<DifficultyLevel, number> = {
    easy: Infinity,
    medium: Infinity,
    hard: Infinity,
    extreme: Infinity
  };

  let processingCell: [number, number] | null = null;
  let processingNumbers: number[] = [];
  let testedValues: number[] = [];

  let isPuzzleCreationMode = false;

  // Add a new state variable to track the current testing value
  let currentTestIndex = 0;
  let isAnimatingTests = false;
  let testingTimer: number;

  // New variables to track reasons
  let failReasons: Record<number, string> = {};
  let constraintExplanation: string = '';

  // Additional variables to track iteration details
  let iterationReasons: Record<string, string> = {};
  let iterationCount: number = 0;

  onMount(() => {
    generator = new SudokuGenerator();
    solver = new SudokuSolver();
    generateNewPuzzle();
  });

  function startTimer() {
    if (startTime === null) {
      startTime = Date.now();
      timerInterval = setInterval(updateTimer, 1000);
    }
  }

  function updateTimer() {
    if (startTime !== null && !isPaused) {
      elapsedTime = Math.floor((Date.now() - (startTime as number)) / 1000);
    }
  }

  function pauseTimer() {
    if (!isPaused) {
      isPaused = true;
      pauseStartTime = Date.now();
      clearInterval(timerInterval);
    }
  }

  function resumeTimer() {
    if (isPaused && pauseStartTime) {
      isPaused = false;
      startTime = startTime + (Date.now() - pauseStartTime);
      timerInterval = setInterval(updateTimer, 1000);
    }
  }

  function formatTime(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  }

  function generateNewPuzzle() {
    isPuzzleCreationMode = false; // Exit puzzle creation mode
    isStepMode = false; // Exit step mode
    const result = generator.generatePuzzle(difficulty);
    board = result.puzzle;
    originalBoard = result.puzzle.map(row => [...row]);
    solution = result.solution;
    selectedCell = null;
    highlightedCell = null;
    showingSolution = false;
    isSolving = false;
    processingCell = null;
    processingNumbers = [];
    testedValues = [];
    currentStep = -1;
    isAnimatingTests = false;
    
    // Reset timer
    clearInterval(timerInterval);
    startTime = null;
    elapsedTime = 0;
    isPaused = false;
    pauseStartTime = null;
  }

  function handleCellClick(row: number, col: number) {
    if (originalBoard[row][col] !== 0 || isSolving) return;
    selectedCell = [row, col];
  }

  function handleNumberInput(num: number) {
    if (!selectedCell || isSolving) return;
    const [row, col] = selectedCell;
    
    // In puzzle creation mode, we validate and set numbers as part of the original puzzle
    if (isPuzzleCreationMode) {
      // Check if the number would be valid in this position
      const isValid = !board.some((r, i) => 
        (i !== row && board[i][col] === num) || // Check column
        (r.some((cell, j) => j !== col && cell === num && Math.floor(i/3) === Math.floor(row/3) && Math.floor(j/3) === Math.floor(col/3))) // Check box
      ) && !board[row].some((cell, j) => j !== col && cell === num); // Check row

      if (isValid) {
        board[row][col] = num;
        originalBoard[row][col] = num; // Set as part of the original puzzle
      }
    } else if (originalBoard[row][col] === 0) {
      // Normal gameplay mode - only allow modifying non-original cells
      if (startTime === null) {
        startTimer();
      }
    board[row][col] = num;
    }
    
    board = [...board]; // Trigger reactivity

    // Check if puzzle is complete
    if (!isPuzzleCreationMode && isPuzzleComplete()) {
      clearInterval(timerInterval);
      gamesPlayed++;
      if (elapsedTime < bestTimes[difficulty]) {
        bestTimes[difficulty] = elapsedTime;
      }
    }
  }

  function isPuzzleComplete(): boolean {
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 9; j++) {
        if (board[i][j] === 0) return false;
      }
    }
    return true;
  }

  function clearCell() {
    if (isSolving || !selectedCell) return;
    
    const [row, col] = selectedCell;
    // Only clear the selected cell if it's not an original cell
    if (originalBoard[row][col] === 0) {
    board[row][col] = 0;
    board = [...board]; // Trigger reactivity
    }
  }

  function clearAll() {
    if (isSolving) return;
    // Clear all cells and enable puzzle creation mode
    board = Array(9).fill(0).map(() => Array(9).fill(0));
    originalBoard = Array(9).fill(0).map(() => Array(9).fill(0));
    selectedCell = null;
    isPuzzleCreationMode = true;
    
    // Reset timer since we're back to initial state
    clearInterval(timerInterval);
    startTime = null;
    elapsedTime = 0;
    isPaused = false;
    pauseStartTime = null;
  }

  async function solvePuzzle() {
    if (isSolving) return;
    isSolving = true;
    solverStats = null;
    isStepMode = false;
    currentStep = -1;
    
    // Create a new board with only original numbers
    const solveBoard = originalBoard.map(row => [...row]);
    solver.setBoard(solveBoard);
    
    // Ensure the solver runs in isolation without any UI updates
    await new Promise(resolve => setTimeout(resolve, 0)); // Let any pending UI updates complete
    const stats = solver.solve(selectedAlgorithm);
    solverStats = stats;
      const steps = solver.getSolutionSteps();
    
    // Reset the board to original state
    board = originalBoard.map(row => [...row]);
    
    // Now handle the visual updates separately
    for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        highlightedCell = [step.row, step.col];
        processingCell = [step.row, step.col];
        
        // Show quick algorithm visualization with color flash based on number of tests
        if (step.testedValues.length > 1) {
            // Quick flash of some tested values for backtracking visualization
            const visibleTests = Math.min(step.testedValues.length, 3); // Only show up to 3 for speed
            
            for (let j = 0; j < visibleTests; j++) {
                // Only show a few tests to give a sense of the backtracking
                if (j < visibleTests - 1) {
                    board[step.row][step.col] = step.testedValues[j];
                    board = [...board];
                    await new Promise(resolve => setTimeout(resolve, 30));
                    board[step.row][step.col] = 0;
                    board = [...board];
                    await new Promise(resolve => setTimeout(resolve, 20));
                }
            }
        }
        
        // Set the final value
        board[step.row][step.col] = step.finalValue;
        board = [...board];
        
        // Calculate delay based on remaining steps - faster toward the end
        const remainingPercentage = 1 - (i / steps.length);
        const delay = Math.max(10, Math.floor(40 * remainingPercentage));
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Clear the processing cell indicator after setting the value
        processingCell = null;
    }
    
    highlightedCell = null;
    
    isSolving = false;
  }

  async function solveStepByStep() {
    if (isSolving) return;
    isSolving = true;
    solverStats = null;
    isStepMode = true;
    currentStep = -1;
    processingCell = null;
    processingNumbers = [];
    testedValues = [];
    failReasons = {};
    constraintExplanation = '';
    iterationReasons = {};
    iterationCount = 0;
    
    // Create a new board with only original numbers
    const solveBoard = originalBoard.map(row => [...row]);
    solver.setBoard(solveBoard);
    
    // Ensure the solver runs in isolation without any UI updates
    await new Promise(resolve => setTimeout(resolve, 0));
    const stats = solver.solve(selectedAlgorithm);
    solverStats = stats;
    solutionSteps = solver.getSolutionSteps();
    
    // Reset board to original state
    board = originalBoard.map(row => [...row]);
    highlightedCell = null;
    isSolving = false;
  }

  async function nextStep() {
    if (!isStepMode || currentStep >= solutionSteps.length - 1 || isAnimatingTests) return;
    
    currentStep++;
    const step = solutionSteps[currentStep];
    highlightedCell = [step.row, step.col];
    processingCell = [step.row, step.col];
    
    // Reset reasons
    failReasons = {};
    constraintExplanation = '';
    iterationReasons = {};
    iterationCount = 0;
    
    // Show animation of testing values
    if (step.testedValues.length > 1) {
      isAnimatingTests = true;
      currentTestIndex = 0;
      testedValues = [];
      processingNumbers = [];
      
      // Determine animation speed based on how many values are being tested
      const baseDelay = step.testedValues.length > 5 ? 150 : 250;
      const failDelay = step.testedValues.length > 5 ? 100 : 150;
      
      // Track which values have already been tested (for backtracking detection)
      const testedSet = new Set();
      let backtrackDetected = false;
      
      // Animate through each tested value
      for (let i = 0; i < step.testedValues.length; i++) {
        iterationCount++;
        testedValues = step.testedValues.slice(0, i + 1);
        processingNumbers = [step.testedValues[i]];
        
        // Check if we're revisiting a value (backtracking)
        const isRevisit = testedSet.has(step.testedValues[i]);
        testedSet.add(step.testedValues[i]);
        
        // Detect when we're likely in a backtracking phase
        if (i > 0 && step.testedValues[i] < step.testedValues[i-1]) {
          backtrackDetected = true;
        }
        
        // Temporarily set the current test value in the cell
        board[step.row][step.col] = step.testedValues[i];
        board = [...board];
        
        // Wait a moment to show the test (faster for longer sequences)
        await new Promise(resolve => setTimeout(resolve, baseDelay));
        
        // If not the final value, clear the cell to show it didn't work
        if (step.testedValues[i] !== step.finalValue) {
          // Get constraint reason for failure
          failReasons[step.testedValues[i]] = getConstraintReason(step.row, step.col, step.testedValues[i]);
          // Store iteration-specific reason
          let iterationLabel = `Iteration ${iterationCount}`;
          if (backtrackDetected) {
            iterationLabel += " (backtracking)";
          }
          if (isRevisit) {
            iterationLabel += " [revisit]";
          }
          iterationReasons[iterationLabel] = `Value ${step.testedValues[i]}: ${getConstraintReason(step.row, step.col, step.testedValues[i])}`;
          
          board[step.row][step.col] = 0;
          board = [...board];
          await new Promise(resolve => setTimeout(resolve, failDelay));
        } else {
          // For the successful value, store why it worked
          let iterationLabel = `Iteration ${iterationCount}`;
          if (backtrackDetected) {
            iterationLabel += " (backtracking)";
          }
          if (isRevisit) {
            iterationLabel += " [revisit]";
          }
          iterationReasons[iterationLabel] = `Value ${step.testedValues[i]}: VALID - All constraints satisfied`;
        }
      }
      
      // Finally, set the successful value
      board[step.row][step.col] = step.finalValue;
      board = [...board];
      processingNumbers = [step.finalValue];
      isAnimatingTests = false;
    } else {
      // If only one value was tested, explain why it was the only valid option
      testedValues = step.testedValues;
      processingNumbers = [step.finalValue];
      board[step.row][step.col] = step.finalValue;
      board = [...board];
      
      // Get constraint explanation for the only valid value
      constraintExplanation = getConstraintExplanation(step.row, step.col, step.finalValue);
    }
  }

  async function prevStep() {
    if (!isStepMode || currentStep < 0 || isAnimatingTests) return;
    
    // Reset current reasons
    failReasons = {};
    constraintExplanation = '';
    iterationReasons = {};
    iterationCount = 0;
    
    const step = solutionSteps[currentStep];
    board[step.row][step.col] = 0;
    board = [...board];
    currentStep--;
    
    if (currentStep >= 0) {
      const prevStep = solutionSteps[currentStep];
      highlightedCell = [prevStep.row, prevStep.col];
      processingCell = [prevStep.row, prevStep.col];
      
      // Show all tested values for this cell
      testedValues = prevStep.testedValues;
      processingNumbers = [prevStep.finalValue];
      board[prevStep.row][prevStep.col] = prevStep.finalValue;
      board = [...board];
      
      // Calculate constraint information for previous step
      if (prevStep.testedValues.length > 1) {
        // Set iteration count for display purposes
        iterationCount = prevStep.testedValues.length;
        
        // Track which values have already been tested (for backtracking detection)
        const testedSet = new Set();
        let backtrackDetected = false;
        
        for (let i = 0; i < prevStep.testedValues.length; i++) {
          // Check if we're revisiting a value (backtracking)
          const isRevisit = testedSet.has(prevStep.testedValues[i]);
          testedSet.add(prevStep.testedValues[i]);
          
          // Detect when we're likely in a backtracking phase
          if (i > 0 && prevStep.testedValues[i] < prevStep.testedValues[i-1]) {
            backtrackDetected = true;
          }
          
          if (prevStep.testedValues[i] !== prevStep.finalValue) {
            failReasons[prevStep.testedValues[i]] = getConstraintReason(prevStep.row, prevStep.col, prevStep.testedValues[i]);
            // Store iteration information
            let iterationLabel = `Iteration ${i+1}`;
            if (backtrackDetected) {
              iterationLabel += " (backtracking)";
            }
            if (isRevisit) {
              iterationLabel += " [revisit]";
            }
            iterationReasons[iterationLabel] = `Value ${prevStep.testedValues[i]}: ${getConstraintReason(prevStep.row, prevStep.col, prevStep.testedValues[i])}`;
          } else {
            // For the successful value, store why it worked
            let iterationLabel = `Iteration ${i+1}`;
            if (backtrackDetected) {
              iterationLabel += " (backtracking)";
            }
            if (isRevisit) {
              iterationLabel += " [revisit]";
            }
            iterationReasons[iterationLabel] = `Value ${prevStep.testedValues[i]}: VALID - All constraints satisfied`;
          }
        }
      } else {
        constraintExplanation = getConstraintExplanation(prevStep.row, prevStep.col, prevStep.finalValue);
      }
    } else {
      highlightedCell = null;
      processingCell = null;
      processingNumbers = [];
      testedValues = [];
    }
  }

  function showSolution() {
    if (!solution || isSolving) return;
    showingSolution = true;
    board = solution.map(row => [...row]);
    
    // Stop timer when showing solution
    clearInterval(timerInterval);
  }

  function hideSolution() {
    if (!solution || isSolving) return;
    showingSolution = false;
    board = originalBoard.map(row => [...row]);
    
    // Resume timer if game wasn't complete
    if (!isPuzzleComplete()) {
      startTimer();
    }
  }

  function resetPuzzle() {
    if (isSolving) return;
    
    // Reset board to original state
    board = originalBoard.map(row => [...row]);
    selectedCell = null;
    highlightedCell = null;
    processingCell = null;
    processingNumbers = [];
    testedValues = [];
    
    // Reset the timer
    clearInterval(timerInterval);
    startTime = null;
    elapsedTime = 0;
    isPaused = false;
    pauseStartTime = null;
    
    // Exit step mode if active
    isStepMode = false;
    currentStep = -1;
    showingSolution = false;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key >= '1' && event.key <= '9') {
      handleNumberInput(parseInt(event.key));
    } else if (event.key === 'Backspace' || event.key === 'Delete') {
      clearCell(); // This will now only clear the selected cell
    }
  }

  // Add a watch on selectedAlgorithm to reset step mode when algorithm changes
  $: if (selectedAlgorithm !== undefined && isStepMode) {
    solveStepByStep();
  }

  // Helper function to get constraint reason
  function getConstraintReason(row: number, col: number, num: number): string {
    // Check row
    for (let j = 0; j < 9; j++) {
      if (j !== col && board[row][j] === num) {
        return `Row ${row + 1} already contains ${num} at column ${j + 1}`;
      }
    }
    
    // Check column
    for (let i = 0; i < 9; i++) {
      if (i !== row && board[i][col] === num) {
        return `Column ${col + 1} already contains ${num} at row ${i + 1}`;
      }
    }
    
    // Check box
    const boxRow = Math.floor(row / 3) * 3;
    const boxCol = Math.floor(col / 3) * 3;
    for (let i = boxRow; i < boxRow + 3; i++) {
      for (let j = boxCol; j < boxCol + 3; j++) {
        if ((i !== row || j !== col) && board[i][j] === num) {
          return `Box ${Math.floor(row / 3) * 3 + Math.floor(col / 3) + 1} already contains ${num} at [${i + 1}, ${j + 1}]`;
        }
      }
    }
    
    return "Unknown constraint";
  }
  
  // Enhanced constraint explanation with more details
  function getConstraintExplanation(row: number, col: number, num: number): string {
    const conflicts = [];
    
    // Check for each alternative value 1-9 why it doesn't work
    for (let n = 1; n <= 9; n++) {
      if (n === num) continue; // Skip the valid value
      
      // Check row conflicts
      let rowConflict = false;
      let colNumber = -1;
      for (let j = 0; j < 9; j++) {
        if (j !== col && board[row][j] === n) {
          rowConflict = true;
          colNumber = j;
          break;
        }
      }
      
      if (rowConflict) {
        conflicts.push(`${n}: Row ${row + 1} already has ${n} at column ${colNumber + 1}`);
        continue;
      }
      
      // Check column conflicts
      let colConflict = false;
      let rowNumber = -1;
      for (let i = 0; i < 9; i++) {
        if (i !== row && board[i][col] === n) {
          colConflict = true;
          rowNumber = i;
          break;
        }
      }
      
      if (colConflict) {
        conflicts.push(`${n}: Column ${col + 1} already has ${n} at row ${rowNumber + 1}`);
        continue;
      }
      
      // Check box
      const boxRow = Math.floor(row / 3) * 3;
      const boxCol = Math.floor(col / 3) * 3;
      let boxConflict = false;
      let conflictRow = -1;
      let conflictCol = -1;
      
      for (let i = boxRow; i < boxRow + 3; i++) {
        for (let j = boxCol; j < boxCol + 3; j++) {
          if ((i !== row || j !== col) && board[i][j] === n) {
            boxConflict = true;
            conflictRow = i;
            conflictCol = j;
            break;
          }
        }
        if (boxConflict) break;
      }
      
      if (boxConflict) {
        conflicts.push(`${n}: Box ${Math.floor(row / 3) * 3 + Math.floor(col / 3) + 1} already has ${n} at [${conflictRow + 1}, ${conflictCol + 1}]`);
        continue;
      }
    }
    
    if (conflicts.length === 0) {
      return `${num} is the only valid value for this cell as all other numbers would create conflicts`;
    }
    
    return `Only ${num} is valid because:\n${conflicts.join('\n')}`;
  }
</script>

<svelte:window on:keydown={handleKeydown}/>

<main style="min-height: 100vh; background-color: #111827; color: white; padding: 2rem 0;">
  <div style="max-width: 1200px; margin: 0 auto; padding: 0 1rem;">
    <header style="margin-bottom: 2rem; text-align: center;">
      <h1 style="font-size: 2.5rem; font-weight: bold; color: white; margin-bottom: 0.5rem;">Pseudoku</h1>
      <p style="color: #9ca3af;">Sudoku Solver with Multiple Algorithms</p>
    </header>
    
    <div style="display: flex; flex-direction: column; align-items: center; gap: 2rem;">
      <div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 1rem; width: 100%;">
        <div style="display: flex; align-items: center; background-color: #1f2937; border-radius: 0.5rem; padding: 0.25rem; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
        <select
          bind:value={difficulty}
            style="padding: 0.5rem 1rem; background-color: transparent; color: white; border: none; height: 2.5rem; outline: none; border-radius: 0.5rem;"
          disabled={isSolving}
        >
            <option style="color: black;" value="easy">Easy</option>
            <option style="color: black;" value="medium">Medium</option>
            <option style="color: black;" value="hard">Hard</option>
            <option style="color: black;" value="extreme">Extreme (4-10 cells)</option>
        </select>
        
        <button
          on:click={generateNewPuzzle}
            style="margin-left: 0.5rem; padding: 0 1rem; height: 2.5rem; background-color: #4f46e5; color: white; border-radius: 0.5rem; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer;"
          disabled={isSolving}
        >
            <svg xmlns="http://www.w3.org/2000/svg" style="height: 1rem; width: 1rem; margin-right: 0.25rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          New Game
        </button>
      </div>

        <div style="display: flex; align-items: center; background-color: #1f2937; border-radius: 0.5rem; padding: 0.25rem; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <select
            bind:value={selectedAlgorithm}
            style="padding: 0.5rem 1rem; background-color: transparent; color: white; border: none; height: 2.5rem; outline: none; border-radius: 0.5rem;"
            disabled={isSolving}
          >
            <option style="color: black;" value={SolverAlgorithm.DLX}>Dancing Links (DLX)</option>
            <option style="color: black;" value={SolverAlgorithm.BACKTRACK}>Backtracking with Bit Operations</option>
            <option style="color: black;" value={SolverAlgorithm.SIMPLE}>Simple Backtracking</option>
          </select>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 1rem; width: 100%;">
        <div style="background-color: #1f2937; border-radius: 0.75rem; padding: 1rem; text-align: center; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <div style="text-transform: uppercase; color: #9ca3af; font-size: 0.875rem; font-weight: 500;">Time</div>
          <div style="font-size: 1.5rem; font-weight: 600; color: white;">{formatTime(elapsedTime)}</div>
        </div>
        <div style="background-color: #1f2937; border-radius: 0.75rem; padding: 1rem; text-align: center; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <div style="text-transform: uppercase; color: #9ca3af; font-size: 0.875rem; font-weight: 500;">Games Played</div>
          <div style="font-size: 1.5rem; font-weight: 600; color: white;">{gamesPlayed}</div>
        </div>
        <div style="background-color: #1f2937; border-radius: 0.75rem; padding: 1rem; text-align: center; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <div style="text-transform: uppercase; color: #9ca3af; font-size: 0.875rem; font-weight: 500;">
            {isPuzzleCreationMode ? 'Creation Mode' : 'Best Time'}
          </div>
          <div style="font-size: 1.5rem; font-weight: 600; color: {isPuzzleCreationMode ? '#10b981' : 'white'};">
            {isPuzzleCreationMode ? 'Active' : bestTimes[difficulty] === Infinity ? 'N/A' : formatTime(bestTimes[difficulty])}
          </div>
        </div>
      </div>

      <div style="display: flex; align-items: center; justify-content: center; gap: 2.5rem;">
        {#if isStepMode}
          <button
            on:click={prevStep}
            style="width: 4rem; height: 14rem; background-color: #4f46e5; color: white; border-radius: 0.5rem; font-size: 1.5rem; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; opacity: {currentStep < 0 ? '0.5' : '1'}; align-self: baseline; margin-top: 25%;"
            disabled={currentStep < 0}
          >
            ←
          </button>
        {/if}

        <div style="display: flex; flex-direction: column; align-items: center; gap: 1rem;">
          <div style="background-color: #1f2937; padding: 1rem; border-radius: 0.75rem; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); position: relative; transform: scale(1.15); margin: 1.2rem 0;">
      <SudokuBoard
        {board}
        {originalBoard}
        {selectedCell}
        {highlightedCell}
              solvingCell={processingCell}
        onCellClick={handleCellClick}
      />
          </div>
          
          {#if isSolving}
            <div style="background-color: #1f2937; padding: 1rem; border-radius: 0.5rem; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); display: flex; align-items: center; gap: 1rem; width: fit-content; margin: 0 auto;">
              <div style="animation: spin 1s linear infinite; height: 2rem; width: 2rem; border-radius: 9999px; border: 2px solid transparent; border-top-color: #4f46e5; border-bottom-color: #4f46e5;"></div>
              <div style="color: white; font-weight: 500;">Solving puzzle...</div>
            </div>
          {/if}
          
          {#if processingCell && isStepMode}
            <div style="padding: 0.75rem; background-color: #1e3a8a; color: white; border-radius: 0.5rem; font-weight: 500; border: 1px solid #3b82f6; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); width: 100%; max-width: 32rem;">
              <div style="font-weight: 600; display: flex; justify-content: space-between; align-items: center;">
                <span>Processing cell [{processingCell[0] + 1}, {processingCell[1] + 1}]</span>
                <span style="font-size: 0.875rem; background-color: #6366f1; padding: 0.125rem 0.5rem; border-radius: 9999px;">
                  {#if selectedAlgorithm === SolverAlgorithm.DLX}
                    DLX
                  {:else if selectedAlgorithm === SolverAlgorithm.BACKTRACK}
                    Bit Backtracking
                  {:else}
                    Simple Backtracking
                  {/if}
                </span>
              </div>
              
              {#if isAnimatingTests}
                <div style="color: #bfdbfe; margin-top: 0.25rem;">
                  <span style="color: #f87171; font-weight: 600;">Backtracking in progress... </span>
                  Testing candidates for cell [{processingCell[0] + 1}, {processingCell[1] + 1}]
                </div>
              {:else if testedValues.length > 1}
                <div style="color: #bfdbfe; margin-top: 0.25rem;">
                  <span>Algorithm tried {testedValues.length} values: </span>
                  <div style="display: flex; flex-wrap: wrap; gap: 0.25rem; margin-top: 0.375rem;">
                    {#each testedValues as val, i}
                      <span style="
                        padding: 0.25rem 0.5rem; 
                        border-radius: 0.25rem; 
                        background-color: {val === processingNumbers[0] ? '#047857' : '#374151'};
                        color: white;
                        font-family: monospace;
                        display: inline-flex;
                        align-items: center;
                        justify-content: center;
                        min-width: 2rem;
                        position: relative;
                      ">
                        {val}
                        {#if val !== processingNumbers[0]}
                          <span style="position: absolute; top: -0.5rem; right: -0.5rem; background-color: #ef4444; height: 1rem; width: 1rem; border-radius: 9999px; display: flex; align-items: center; justify-content: center; font-size: 0.75rem; font-weight: bold;">✕</span>
                        {/if}
                      </span>
                    {/each}
                  </div>
                  
                  {#if selectedAlgorithm === SolverAlgorithm.SIMPLE && Object.keys(iterationReasons).length > 0}
                    <div style="margin-top: 0.5rem; background-color: rgba(79, 70, 229, 0.1); padding: 0.5rem; border-radius: 0.375rem; border-left: 3px solid #4f46e5;">
                      <div style="font-size: 0.875rem; font-weight: 500; color: #c7d2fe;">Simple Backtracking Iterations:</div>
                      <div style="font-size: 0.75rem; margin-top: 0.25rem; margin-bottom: 0.5rem; font-style: italic; color: #c7d2fe;">
                        <span style="background-color: rgba(79, 70, 229, 0.2); padding: 0.125rem 0.25rem; border-radius: 0.25rem; margin-right: 0.25rem;">(backtracking)</span> indicates the algorithm has returned to this cell after encountering dead ends in later cells.
                      </div>
                      <details>
                        <summary style="cursor: pointer; color: #c7d2fe; font-weight: 500; display: inline-flex; align-items: center; margin-bottom: 0.5rem;">
                          <span style="margin-right: 0.25rem;">View all {Object.keys(iterationReasons).length} iterations</span>
                          <svg xmlns="http://www.w3.org/2000/svg" style="height: 1rem; width: 1rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </summary>
                        <div style="font-size: 0.875rem; color: #c7d2fe; max-height: 200px; overflow-y: auto; padding-right: 0.5rem;">
                          <ul style="margin: 0; padding-left: 1.25rem;">
                            {#each Object.entries(iterationReasons) as [iteration, reason]}
                              <li style="margin-bottom: 0.25rem; padding: 0.25rem; background-color: {iteration.includes('(backtracking)') ? 'rgba(248, 113, 113, 0.15)' : 'rgba(79, 70, 229, 0.05)'}; border-radius: 0.25rem;">
                                <strong style="{iteration.includes('(backtracking)') ? 'color: #f87171;' : ''}">{iteration}:</strong> 
                                <span style="{reason.includes('VALID') ? 'color: #10b981; font-weight: 500;' : ''}">{reason}</span>
                              </li>
                            {/each}
                          </ul>
                        </div>
                      </details>
                      <div style="font-size: 0.875rem; margin-top: 0.25rem; color: #c7d2fe;">
                        <strong>Summary:</strong> Found valid value {processingNumbers[0]} after {iterationCount} iterations 
                        {#if Object.entries(iterationReasons).some(([k, v]) => k.includes('backtracking'))}
                          with significant backtracking.
                        {:else}
                          with minimal backtracking.
                        {/if}
                      </div>
                    </div>
                  {/if}
                  
                  {#if Object.keys(failReasons).length > 0}
                    <div style="margin-top: 0.5rem; background-color: rgba(239, 68, 68, 0.1); padding: 0.5rem; border-radius: 0.375rem; border-left: 3px solid #ef4444;">
                      <div style="font-size: 0.875rem; font-weight: 500; color: #fca5a5;">Why values failed:</div>
                      <details>
                        <summary style="cursor: pointer; color: #fca5a5; font-weight: 500; display: inline-flex; align-items: center; margin-bottom: 0.5rem;">
                          <span style="margin-right: 0.25rem;">View all failed values</span>
                          <svg xmlns="http://www.w3.org/2000/svg" style="height: 1rem; width: 1rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </summary>
                        <div style="font-size: 0.875rem; color: #fca5a5;">
                          <ul style="margin: 0; padding-left: 1.25rem;">
                            {#each Object.entries(failReasons) as [value, reason]}
                              <li style="margin-bottom: 0.25rem;">
                                <strong>{value}:</strong> {reason}
                              </li>
                            {/each}
                          </ul>
                        </div>
                      </details>
                    </div>
                  {/if}
                </div>
                <div style="color: #4ade80; font-weight: 600; margin-top: 0.5rem; display: flex; align-items: center;">
                  <svg xmlns="http://www.w3.org/2000/svg" style="height: 1.25rem; width: 1.25rem; margin-right: 0.375rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Valid value: 
                  <span style="
                    padding: 0.25rem 0.5rem; 
                    margin-left: 0.375rem;
                    border-radius: 0.25rem; 
                    background-color: #047857;
                    color: white;
                    font-family: monospace;
                  ">{processingNumbers[0]}</span>
                  {#if selectedAlgorithm === SolverAlgorithm.SIMPLE}
                  <span style="margin-left: 0.5rem; color: #4ade80; font-size: 0.875rem; background-color: rgba(4, 120, 87, 0.2); padding: 0.25rem 0.5rem; border-radius: 0.25rem;">Found after {iterationCount} iterations</span>
                  {/if}
                </div>
                <div style="margin-top: 0.5rem; padding: 0.5rem; background-color: rgba(15, 23, 42, 0.5); border-radius: 0.375rem;">
                  <details>
                    <summary style="cursor: pointer; color: #94a3b8; font-weight: 500; display: inline-flex; align-items: center;">
                      <span style="margin-right: 0.25rem;">How this algorithm works</span>
                      <svg xmlns="http://www.w3.org/2000/svg" style="height: 1rem; width: 1rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </summary>
                    <div style="font-size: 0.875rem; margin-top: 0.25rem; color: #e2e8f0;">
                      {#if selectedAlgorithm === SolverAlgorithm.DLX}
                        <strong>Dancing Links (DLX)</strong> implements Algorithm X designed specifically for exact cover problems.
                        <br><br>
                        <details>
                          <summary style="cursor: pointer; color: #4ade80; font-weight: 500; display: inline-flex; align-items: center;">
                            <span style="margin-right: 0.25rem;">View detailed explanation</span>
                            <svg xmlns="http://www.w3.org/2000/svg" style="height: 1rem; width: 1rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                            </svg>
                          </summary>
                          <div style="margin-top: 0.5rem; padding: 0.5rem; background-color: rgba(15, 23, 42, 0.3); border-radius: 0.375rem;">
                            <strong>Algorithm Steps:</strong>
                            <ol style="margin-top: 0.25rem; padding-left: 1.25rem;">
                              <li>Represents Sudoku as a matrix where each cell placement must satisfy 4 constraints</li>
                              <li>Selects columns with the fewest possibilities first (heuristic)</li>
                              <li>When a row is chosen, it "covers" all its constraints, removing them from consideration</li>
                              <li>Uses efficient "uncovering" when backtracking is needed</li> 
                              <li>Circular doubly-linked list enables O(1) operations for node removal and reinsertion</li>
                            </ol>
                            
                            <strong>Constraints applied:</strong>
                            <ul style="margin-top: 0.25rem; padding-left: 1.25rem;">
                              <li>Each cell must contain exactly one value (cell constraint)</li>
                              <li>Each row must contain digits 1-9 exactly once (row constraint)</li>
                              <li>Each column must contain digits 1-9 exactly once (column constraint)</li>
                              <li>Each 3x3 box must contain digits 1-9 exactly once (box constraint)</li>
                            </ul>
                            
                            <strong>Key advantages:</strong>
                            <ul style="margin-top: 0.25rem; padding-left: 1.25rem;">
                              <li>Very efficient for highly constrained problems</li>
                              <li>Usually requires fewer steps than other backtracking methods</li>
                              <li>Can solve even the most difficult puzzles quickly</li>
                              <li>Optimal selection of next constraints minimizes branching</li>
                            </ul>
                            
                            <strong>How it works in this step:</strong>
                            <p style="margin-top: 0.25rem; padding-left: 0.5rem; border-left: 2px solid #4f46e5;">
                              For cell [{processingCell?.[0] + 1}, {processingCell?.[1] + 1}], DLX has determined that value {processingNumbers[0]} is the only one that satisfies all constraints simultaneously. The algorithm efficiently identified this by checking which value covers all required constraints in the exact cover matrix without conflicting with previously placed values.
                            </p>
                          </div>
                        </details>
                        <br>
                        The algorithm explores the search space by selecting, covering, and uncovering columns in the constraint matrix. In the current step, it's identifying which value satisfies all four constraints simultaneously.
                      {:else if selectedAlgorithm === SolverAlgorithm.BACKTRACK}
                        <strong>Bit Backtracking</strong> optimizes standard backtracking by using bitwise operations for faster constraint checking.
                        <br><br>
                        <details>
                          <summary style="cursor: pointer; color: #4ade80; font-weight: 500; display: inline-flex; align-items: center;">
                            <span style="margin-right: 0.25rem;">View detailed explanation</span>
                            <svg xmlns="http://www.w3.org/2000/svg" style="height: 1rem; width: 1rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                            </svg>
                          </summary>
                          <div style="margin-top: 0.5rem; padding: 0.5rem; background-color: rgba(15, 23, 42, 0.3); border-radius: 0.375rem;">
                            <strong>Algorithm Steps:</strong>
                            <ol style="margin-top: 0.25rem; padding-left: 1.25rem;">
                              <li>Initialize bit masks for each row, column, and box to track used digits</li>
                              <li>For each empty cell, compute available digits using bitwise operations</li>
                              <li>If multiple digits are possible, try each one and continue recursively</li>
                              <li>Update bit masks when placing or removing digits</li>
                              <li>Backtrack when no valid digit exists for a cell</li>
                            </ol>
                            
                            <strong>Constraints applied with bit masks:</strong>
                            <ul style="margin-top: 0.25rem; padding-left: 1.25rem;">
                              <li>Row mask: Tracks which digits are already used in the current row</li>
                              <li>Column mask: Tracks which digits are already used in the current column</li>
                              <li>Box mask: Tracks which digits are already used in the current 3x3 box</li>
                              <li>Combined mask: NOT(rowMask OR colMask OR boxMask)</li>
                            </ul>
                            
                            <strong>Bitwise operations used:</strong>
                            <ul style="margin-top: 0.25rem; padding-left: 1.25rem;">
                              <li><span style="font-family: monospace;">|</span> (OR): Combines constraints</li>
                              <li><span style="font-family: monospace;">~</span> (NOT): Inverts bits to get available digits</li>
                              <li><span style="font-family: monospace;">&</span> (AND): Check if a specific digit is available</li>
                              <li><span style="font-family: monospace;">1 &lt;&lt; (digit-1)</span>: Create a bit mask for a digit</li>
                              <li><span style="font-family: monospace;">mask & -mask</span>: Extract the least significant set bit</li>
                            </ul>
                            
                            <strong>Key advantages:</strong>
                            <ul style="margin-top: 0.25rem; padding-left: 1.25rem;">
                              <li>Very fast constraint checking (O(1) operations)</li>
                              <li>Reduced memory usage compared to other methods</li>
                              <li>Quickly determines available digits for any cell</li>
                              <li>Efficient on modern CPUs with optimized bit operations</li>
                            </ul>
                            
                            <strong>How it works in this step:</strong>
                            <p style="margin-top: 0.25rem; padding-left: 0.5rem; border-left: 2px solid #4f46e5;">
                              For cell [{processingCell?.[0] + 1}, {processingCell?.[1] + 1}], the algorithm computes three masks: row={processingCell?.[0] + 1}, column={processingCell?.[1] + 1}, and box={(Math.floor(processingCell?.[0]/3) * 3 + Math.floor(processingCell?.[1]/3)) + 1}. It then combines these masks with bitwise OR, inverts with NOT, and determines {processingNumbers[0]} is the valid digit because its corresponding bit is set in the final mask.
                            </p>
                          </div>
                        </details>
                        <br>
                        Each mask is a 9-bit integer where bit position i is set if value i+1 is already used. Valid numbers have corresponding bits unset in all three masks.
                      {:else}
                        <strong>Simple Backtracking</strong> is a brute-force search approach that explores all possible combinations.
                        <br><br>
                        <details>
                          <summary style="cursor: pointer; color: #4ade80; font-weight: 500; display: inline-flex; align-items: center;">
                            <span style="margin-right: 0.25rem;">View detailed explanation</span>
                            <svg xmlns="http://www.w3.org/2000/svg" style="height: 1rem; width: 1rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                            </svg>
                          </summary>
                          <div style="margin-top: 0.5rem; padding: 0.5rem; background-color: rgba(15, 23, 42, 0.3); border-radius: 0.375rem;">
                            <strong>Algorithm Steps:</strong>
                            <ol style="margin-top: 0.25rem; padding-left: 1.25rem;">
                              <li>Find the next empty cell in the grid (scanning left-to-right, top-to-bottom)</li>
                              <li>Try digits 1-9 in the empty cell, checking constraints after each</li>
                              <li>If a digit is valid, recursively attempt to solve the rest of the grid</li>
                              <li>If the recursive call fails, undo the placement (backtrack)</li>
                              <li>Try the next digit, or fail if all digits have been attempted</li>
                            </ol>
                            
                            <strong>Constraints checked for each value:</strong>
                            <ul style="margin-top: 0.25rem; padding-left: 1.25rem;">
                              <li>Row constraint: Value cannot repeat in the same row</li>
                              <li>Column constraint: Value cannot repeat in the same column</li>
                              <li>Box constraint: Value cannot repeat in the same 3x3 box</li>
                            </ul>
                            
                            <strong>Recursive nature:</strong>
                            <ul style="margin-top: 0.25rem; padding-left: 1.25rem;">
                              <li>Depth-first search through the solution space</li>
                              <li>Solution stack can reach depth of up to 81 cells</li>
                              <li>Makes many "wrong turns" before finding the solution</li>
                              <li>Time complexity: O(9^m) where m is number of empty cells</li>
                            </ul>
                            
                            <div style="margin-top: 0.5rem; background-color: rgba(16, 185, 129, 0.1); padding: 0.5rem; border-radius: 0.375rem; border-left: 3px solid #10b981;">
                              <strong>Why multiple iterations occur:</strong><br>
                              When finding a valid value (e.g., 9), it places that value and recursively tries solving the rest. If a later cell leads to a dead end, the algorithm backtracks to this cell and tries the next value. This explains why you see multiple valid iterations or testing after finding a good value.
                              <br><br>
                              <strong>Example:</strong> If 9 is valid at iteration 9, the algorithm places 9 and moves forward. Encountering an unsolvable situation later forces it to return to this cell to try other values from iteration 10 onwards.
                            </div>
                            
                            <strong>How it works in this step:</strong>
                            <p style="margin-top: 0.25rem; padding-left: 0.5rem; border-left: 2px solid #4f46e5;">
                              For cell [{processingCell?.[0] + 1}, {processingCell?.[1] + 1}], the algorithm immediately determined that {processingNumbers[0]} is a valid value (it satisfies all constraints). Since there were no other valid values to try, it proceeded with this value without testing alternatives.
                            </p>
                          </div>
                        </details>
                        <br>
                        The algorithm checks each possible value against the Sudoku constraints and selects the first valid one it finds. In this case, it found {processingNumbers[0]} to be valid without needing to test alternatives.
                      {/if}
                    </div>
                  </details>
                </div>
              {:else}
                <div style="color: #bfdbfe; margin-top: 0.25rem; display: flex; align-items: center;">
                  <svg xmlns="http://www.w3.org/2000/svg" style="height: 1.25rem; width: 1.25rem; margin-right: 0.375rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Identified valid value immediately without backtracking
                </div>
                <div style="color: #4ade80; font-weight: 600; margin-top: 0.5rem; display: flex; align-items: center;">
                  <svg xmlns="http://www.w3.org/2000/svg" style="height: 1.25rem; width: 1.25rem; margin-right: 0.375rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Value: 
                  <span style="
                    padding: 0.25rem 0.5rem; 
                    margin-left: 0.375rem;
                    border-radius: 0.25rem; 
                    background-color: #047857;
                    color: white;
                    font-family: monospace;
                  ">{processingNumbers[0]}</span>
                </div>
                
                {#if constraintExplanation}
                  <div style="margin-top: 0.5rem; background-color: rgba(16, 185, 129, 0.1); padding: 0.5rem; border-radius: 0.375rem; border-left: 3px solid #10b981;">
                    <div style="font-size: 0.875rem; font-weight: 500; color: #a7f3d0;">Why this value:</div>
                    <details open>
                      <summary style="cursor: pointer; color: #a7f3d0; font-weight: 500; margin-top: 0.25rem;">
                        View constraints
                      </summary>
                      <div style="font-size: 0.875rem; margin-top: 0.25rem; color: #a7f3d0; white-space: pre-line;">
                        {constraintExplanation}
                      </div>
                    </details>
                    
                    <div style="font-size: 0.875rem; margin-top: 0.375rem; color: #a7f3d0; border-top: 1px solid rgba(16, 185, 129, 0.3); padding-top: 0.375rem;">
                      {#if selectedAlgorithm === SolverAlgorithm.DLX}
                        DLX quickly identified this as the only option that satisfies all constraints in the exact cover matrix.
                      {:else if selectedAlgorithm === SolverAlgorithm.BACKTRACK}
                        The bit operations identified that only one bit was set in the valid candidates mask for this cell.
                      {:else}
                        The algorithm detected this was the only valid value without needing to test alternatives.
                      {/if}
                    </div>
                  </div>
                {:else}
                  <div style="font-size: 0.875rem; margin-top: 0.5rem; color: #94a3b8; font-style: italic;">
                    This cell had only one possible value based on the constraints.
                  </div>
                {/if}
                
                <div style="margin-top: 0.5rem; padding: 0.5rem; background-color: rgba(15, 23, 42, 0.5); border-radius: 0.375rem;">
                  <details>
                    <summary style="cursor: pointer; color: #94a3b8; font-weight: 500; display: inline-flex; align-items: center;">
                      <span style="margin-right: 0.25rem;">How this algorithm works</span>
                      <svg xmlns="http://www.w3.org/2000/svg" style="height: 1rem; width: 1rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </summary>
                    <div style="font-size: 0.875rem; margin-top: 0.25rem; color: #e2e8f0;">
                      {#if selectedAlgorithm === SolverAlgorithm.DLX}
                        <strong>Dancing Links (DLX)</strong> implements Algorithm X designed specifically for exact cover problems.
                        <br><br>
                        <details>
                          <summary style="cursor: pointer; color: #4ade80; font-weight: 500; display: inline-flex; align-items: center;">
                            <span style="margin-right: 0.25rem;">View detailed explanation</span>
                            <svg xmlns="http://www.w3.org/2000/svg" style="height: 1rem; width: 1rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                            </svg>
                          </summary>
                          <div style="margin-top: 0.5rem; padding: 0.5rem; background-color: rgba(15, 23, 42, 0.3); border-radius: 0.375rem;">
                            <strong>Algorithm Steps:</strong>
                            <ol style="margin-top: 0.25rem; padding-left: 1.25rem;">
                              <li>Represents Sudoku as a matrix where each cell placement must satisfy 4 constraints</li>
                              <li>Selects columns with the fewest possibilities first (heuristic)</li>
                              <li>When a row is chosen, it "covers" all its constraints, removing them from consideration</li>
                              <li>Uses efficient "uncovering" when backtracking is needed</li> 
                              <li>Circular doubly-linked list enables O(1) operations for node removal and reinsertion</li>
                            </ol>
                            
                            <strong>Constraints applied:</strong>
                            <ul style="margin-top: 0.25rem; padding-left: 1.25rem;">
                              <li>Each cell must contain exactly one value (cell constraint)</li>
                              <li>Each row must contain digits 1-9 exactly once (row constraint)</li>
                              <li>Each column must contain digits 1-9 exactly once (column constraint)</li>
                              <li>Each 3x3 box must contain digits 1-9 exactly once (box constraint)</li>
                            </ul>
                            
                            <strong>Key advantages:</strong>
                            <ul style="margin-top: 0.25rem; padding-left: 1.25rem;">
                              <li>Very efficient for highly constrained problems</li>
                              <li>Usually requires fewer steps than other backtracking methods</li>
                              <li>Can solve even the most difficult puzzles quickly</li>
                              <li>Optimal selection of next constraints minimizes branching</li>
                            </ul>
                            
                            <strong>How it works in this step:</strong>
                            <p style="margin-top: 0.25rem; padding-left: 0.5rem; border-left: 2px solid #4f46e5;">
                              For cell [{processingCell?.[0] + 1}, {processingCell?.[1] + 1}], DLX has determined that value {processingNumbers[0]} is the only one that satisfies all constraints simultaneously. The algorithm efficiently identified this by checking which value covers all required constraints in the exact cover matrix without conflicting with previously placed values.
                            </p>
                          </div>
                        </details>
                        <br>
                        The algorithm explores the search space by selecting, covering, and uncovering columns in the constraint matrix. In the current step, it's identifying which value satisfies all four constraints simultaneously.
                      {:else if selectedAlgorithm === SolverAlgorithm.BACKTRACK}
                        <strong>Bit Backtracking</strong> optimizes standard backtracking by using bitwise operations for faster constraint checking.
                        <br><br>
                        <details>
                          <summary style="cursor: pointer; color: #4ade80; font-weight: 500; display: inline-flex; align-items: center;">
                            <span style="margin-right: 0.25rem;">View detailed explanation</span>
                            <svg xmlns="http://www.w3.org/2000/svg" style="height: 1rem; width: 1rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                            </svg>
                          </summary>
                          <div style="margin-top: 0.5rem; padding: 0.5rem; background-color: rgba(15, 23, 42, 0.3); border-radius: 0.375rem;">
                            <strong>Algorithm Steps:</strong>
                            <ol style="margin-top: 0.25rem; padding-left: 1.25rem;">
                              <li>Initialize bit masks for each row, column, and box to track used digits</li>
                              <li>For each empty cell, compute available digits using bitwise operations</li>
                              <li>If multiple digits are possible, try each one and continue recursively</li>
                              <li>Update bit masks when placing or removing digits</li>
                              <li>Backtrack when no valid digit exists for a cell</li>
                            </ol>
                            
                            <strong>Constraints applied with bit masks:</strong>
                            <ul style="margin-top: 0.25rem; padding-left: 1.25rem;">
                              <li>Row mask: Tracks which digits are already used in the current row</li>
                              <li>Column mask: Tracks which digits are already used in the current column</li>
                              <li>Box mask: Tracks which digits are already used in the current 3x3 box</li>
                              <li>Combined mask: NOT(rowMask OR colMask OR boxMask)</li>
                            </ul>
                            
                            <strong>Bitwise operations used:</strong>
                            <ul style="margin-top: 0.25rem; padding-left: 1.25rem;">
                              <li><span style="font-family: monospace;">|</span> (OR): Combines constraints</li>
                              <li><span style="font-family: monospace;">~</span> (NOT): Inverts bits to get available digits</li>
                              <li><span style="font-family: monospace;">&</span> (AND): Check if a specific digit is available</li>
                              <li><span style="font-family: monospace;">1 &lt;&lt; (digit-1)</span>: Create a bit mask for a digit</li>
                              <li><span style="font-family: monospace;">mask & -mask</span>: Extract the least significant set bit</li>
                            </ul>
                            
                            <strong>Key advantages:</strong>
                            <ul style="margin-top: 0.25rem; padding-left: 1.25rem;">
                              <li>Very fast constraint checking (O(1) operations)</li>
                              <li>Reduced memory usage compared to other methods</li>
                              <li>Quickly determines available digits for any cell</li>
                              <li>Efficient on modern CPUs with optimized bit operations</li>
                            </ul>
                            
                            <strong>How it works in this step:</strong>
                            <p style="margin-top: 0.25rem; padding-left: 0.5rem; border-left: 2px solid #4f46e5;">
                              For cell [{processingCell?.[0] + 1}, {processingCell?.[1] + 1}], the algorithm computes three masks: row={processingCell?.[0] + 1}, column={processingCell?.[1] + 1}, and box={(Math.floor(processingCell?.[0]/3) * 3 + Math.floor(processingCell?.[1]/3)) + 1}. It then combines these masks with bitwise OR, inverts with NOT, and determines {processingNumbers[0]} is the valid digit because its corresponding bit is set in the final mask.
                            </p>
                          </div>
                        </details>
                        <br>
                        Each mask is a 9-bit integer where bit position i is set if value i+1 is already used. Valid numbers have corresponding bits unset in all three masks.
                      {:else}
                        <strong>Simple Backtracking</strong> is a brute-force search approach that explores all possible combinations.
                        <br><br>
                        <details>
                          <summary style="cursor: pointer; color: #4ade80; font-weight: 500; display: inline-flex; align-items: center;">
                            <span style="margin-right: 0.25rem;">View detailed explanation</span>
                            <svg xmlns="http://www.w3.org/2000/svg" style="height: 1rem; width: 1rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
                            </svg>
                          </summary>
                          <div style="margin-top: 0.5rem; padding: 0.5rem; background-color: rgba(15, 23, 42, 0.3); border-radius: 0.375rem;">
                            <strong>Algorithm Steps:</strong>
                            <ol style="margin-top: 0.25rem; padding-left: 1.25rem;">
                              <li>Find the next empty cell in the grid (scanning left-to-right, top-to-bottom)</li>
                              <li>Try digits 1-9 in the empty cell, checking constraints after each</li>
                              <li>If a digit is valid, recursively attempt to solve the rest of the grid</li>
                              <li>If the recursive call fails, undo the placement (backtrack)</li>
                              <li>Try the next digit, or fail if all digits have been attempted</li>
                            </ol>
                            
                            <strong>Constraints checked for each value:</strong>
                            <ul style="margin-top: 0.25rem; padding-left: 1.25rem;">
                              <li>Row constraint: Value cannot repeat in the same row</li>
                              <li>Column constraint: Value cannot repeat in the same column</li>
                              <li>Box constraint: Value cannot repeat in the same 3x3 box</li>
                            </ul>
                            
                            <strong>Recursive nature:</strong>
                            <ul style="margin-top: 0.25rem; padding-left: 1.25rem;">
                              <li>Depth-first search through the solution space</li>
                              <li>Solution stack can reach depth of up to 81 cells</li>
                              <li>Makes many "wrong turns" before finding the solution</li>
                              <li>Time complexity: O(9^m) where m is number of empty cells</li>
                            </ul>
                            
                            <div style="margin-top: 0.5rem; background-color: rgba(16, 185, 129, 0.1); padding: 0.5rem; border-radius: 0.375rem; border-left: 3px solid #10b981;">
                              <strong>Why multiple iterations occur:</strong><br>
                              When finding a valid value (e.g., 9), it places that value and recursively tries solving the rest. If a later cell leads to a dead end, the algorithm backtracks to this cell and tries the next value. This explains why you see multiple valid iterations or testing after finding a good value.
                              <br><br>
                              <strong>Example:</strong> If 9 is valid at iteration 9, the algorithm places 9 and moves forward. Encountering an unsolvable situation later forces it to return to this cell to try other values from iteration 10 onwards.
                            </div>
                            
                            <strong>How it works in this step:</strong>
                            <p style="margin-top: 0.25rem; padding-left: 0.5rem; border-left: 2px solid #4f46e5;">
                              For cell [{processingCell?.[0] + 1}, {processingCell?.[1] + 1}], the algorithm immediately determined that {processingNumbers[0]} is a valid value (it satisfies all constraints). Since there were no other valid values to try, it proceeded with this value without testing alternatives.
                            </p>
                          </div>
                        </details>
                        <br>
                        The algorithm checks each possible value against the Sudoku constraints and selects the first valid one it finds. In this case, it found {processingNumbers[0]} to be valid without needing to test alternatives.
                      {/if}
                    </div>
                  </details>
                </div>
              {/if}
            </div>
          {/if}

          {#if solverStats}
            <div style="padding: 0.75rem; background-color: #1e3a8a; color: white; border-radius: 0.5rem; font-weight: 500; border: 1px solid #3b82f6; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); width: 100%; max-width: 28rem;">
              <div style="font-weight: 600;">Solver Stats</div>
              <div>Time: <span style="font-family: monospace;">{solverStats.timeMs.toLocaleString(undefined, {
                minimumFractionDigits: 6,
                maximumFractionDigits: 6
              })}</span> ms</div>
              <div>Steps: {solverStats.steps}</div>
            </div>
          {/if}
        </div>

        {#if isStepMode}
          <button
            on:click={nextStep}
            style="width: 4rem; height: 14rem; background-color: #4f46e5; color: white; border-radius: 0.5rem; font-size: 1.5rem; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; opacity: {currentStep >= solutionSteps.length - 1 ? '0.5' : '1'}; align-self: baseline; margin-top: 25%;"
            disabled={currentStep >= solutionSteps.length - 1}
          >
            →
          </button>
        {/if}
      </div>

      <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem; margin-top: 0.5rem;">
        {#each Array(9) as _, i}
          <button
            on:click={() => handleNumberInput(i + 1)}
            style="width: 2.5rem; height: 2.5rem; font-size: 1.125rem; font-weight: 600; background-color: #1f2937; color: white; border-radius: 0.5rem; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1); display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; opacity: {isSolving ? '0.5' : '1'};"
            disabled={isSolving}
          >
            {i + 1}
          </button>
        {/each}
      </div>

      <div style="display: flex; flex-wrap: wrap; gap: 0.75rem; justify-content: center; margin-top: 0.5rem;">
        <button
          on:click={clearCell}
          style="height: 2.5rem; padding: 0 1rem; background-color: #374151; color: white; border-radius: 0.5rem; display: flex; align-items: center; justify-content: center; border: 1px solid #4b5563; cursor: pointer; opacity: {isSolving ? '0.5' : '1'};"
          disabled={isSolving}
        >
          <svg xmlns="http://www.w3.org/2000/svg" style="height: 1rem; width: 1rem; margin-right: 0.25rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Clear Cell
        </button>
        
        <button
          on:click={clearAll}
          style="height: 2.5rem; padding: 0 1rem; background-color: #374151; color: white; border-radius: 0.5rem; display: flex; align-items: center; justify-content: center; border: 1px solid #4b5563; cursor: pointer; opacity: {isSolving ? '0.5' : '1'};"
          disabled={isSolving}
        >
          <svg xmlns="http://www.w3.org/2000/svg" style="height: 1rem; width: 1rem; margin-right: 0.25rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
          Clear All
        </button>
        
        <button
          on:click={solvePuzzle}
          style="height: 2.5rem; padding: 0 1rem; background-color: #047857; color: white; border-radius: 0.5rem; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; opacity: {isSolving ? '0.5' : '1'};"
          disabled={isSolving}
        >
          <svg xmlns="http://www.w3.org/2000/svg" style="height: 1rem; width: 1rem; margin-right: 0.25rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          Solve
        </button>

        <button
          on:click={solveStepByStep}
          style="height: 2.5rem; padding: 0 1rem; background-color: #1d4ed8; color: white; border-radius: 0.5rem; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; opacity: {isSolving ? '0.5' : '1'};"
          disabled={isSolving}
        >
          <svg xmlns="http://www.w3.org/2000/svg" style="height: 1rem; width: 1rem; margin-right: 0.25rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Step Mode
        </button>
        
        {#if isStepMode}
          <div style="height: 2.5rem; padding: 0 1rem; background-color: #1e3a8a; color: white; border-radius: 0.5rem; font-weight: 500; border: 1px solid #3b82f6; display: flex; align-items: center; justify-content: center;">
            Step {currentStep + 1} / {solutionSteps.length}
          </div>
        {/if}
        
        {#if !showingSolution}
          <button
            on:click={showSolution}
            style="height: 2.5rem; padding: 0 1rem; background-color: #d97706; color: white; border-radius: 0.5rem; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; opacity: {isSolving ? '0.5' : '1'};"
            disabled={isSolving}
          >
            <svg xmlns="http://www.w3.org/2000/svg" style="height: 1rem; width: 1rem; margin-right: 0.25rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            Show Solution
          </button>
        {:else}
          <button
            on:click={hideSolution}
            style="height: 2.5rem; padding: 0 1rem; background-color: #d97706; color: white; border-radius: 0.5rem; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; opacity: {isSolving ? '0.5' : '1'};"
            disabled={isSolving}
          >
            <svg xmlns="http://www.w3.org/2000/svg" style="height: 1rem; width: 1rem; margin-right: 0.25rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
            Hide Solution
          </button>
        {/if}
        
        <button
          on:click={resetPuzzle}
          style="height: 2.5rem; padding: 0 1rem; background-color: #4b5563; color: white; border-radius: 0.5rem; display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; opacity: {isSolving ? '0.5' : '1'};"
          disabled={isSolving}
        >
          <svg xmlns="http://www.w3.org/2000/svg" style="height: 1rem; width: 1rem; margin-right: 0.25rem;" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Reset Puzzle
        </button>
      </div>
    </div>
  </div>

  <footer style="margin-top: 4rem; padding-bottom: 2rem; text-align: center; color: #9ca3af; font-size: 0.875rem;">
    <p>Pseudoku - Made with ❤️ by <a href="https://github.com/mdarud" style="color: #9ca3af;">Daru</a></p>
  </footer>
</main>

<style>
  :global(body) {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 
                 Oxygen-Sans, Ubuntu, Cantarell, 'Helvetica Neue', sans-serif;
    background-color: #111827;
    color: white;
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>
