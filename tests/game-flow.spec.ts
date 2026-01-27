import { test, expect, Page } from '@playwright/test';

/**
 * Full game flow E2E test.
 * 
 * Tests the complete flow:
 * 1. 4 players join a room
 * 2. Players select teams (or use randomize)
 * 3. Owner starts the game
 * 4. Clue giver gives a clue
 * 5. Guesser votes and reveals a card
 * 6. Turn changes appropriately
 */

/**
 * Helper: Get card indices by team from clue giver's view
 * Clue giver cards have distinctive border colors
 */
async function getTeamCards(clueGiverPage: Page, team: 'red' | 'blue'): Promise<number[]> {
  const borderClass = team === 'red' ? 'border-red-500' : 'border-blue-500';
  
  const indices: number[] = [];
  for (let i = 0; i < 25; i++) {
    const card = clueGiverPage.getByTestId(`board-card-${i}`);
    const classes = await card.getAttribute('class');
    if (classes?.includes(borderClass)) {
      indices.push(i);
    }
  }
  return indices;
}

/**
 * Helper: Wait for a player to appear in the lobby
 * Uses test ID for reliable detection across Firebase sync latency
 */
async function waitForPlayerVisible(page: Page, playerName: string, timeout = 20000) {
  await expect(page.getByTestId(`lobby-player-${playerName}`)).toBeVisible({ timeout });
}

/**
 * Helper: Wait for clue to be displayed after submission
 */
async function waitForClueDisplayed(page: Page, clueWord: string, timeout = 5000) {
  // The clue appears in the status panel or clue history
  await expect(page.getByText(clueWord, { exact: false }).first()).toBeVisible({ timeout });
}

test.describe('Full Game Flow', () => {
  test('complete game flow with 4 players', async ({ context }) => {
    test.setTimeout(120000); // 2 minutes for multi-player test with Firebase latency
    // Create 4 browser pages for 4 players
    const pages = await Promise.all([
      context.newPage(),
      context.newPage(),
      context.newPage(),
      context.newPage(),
    ]);

    const playerNames = ['RedClue', 'RedGuess', 'BlueClue', 'BlueGuess'];

    // ========================================
    // Step 1: First player creates room
    // ========================================
    await pages[0].goto('/');
    await pages[0].getByTestId('home-name-input').fill(playerNames[0]);
    await pages[0].getByTestId('home-create-btn').click();

    // Wait for navigation and get room code
    await expect(pages[0]).toHaveURL(/\/room\/[A-Z0-9]+/);
    const url = pages[0].url();
    const roomCode = url.match(/\/room\/([A-Z0-9]+)/)?.[1];
    expect(roomCode).toBeTruthy();

    // Wait for lobby to load
    await expect(pages[0].getByTestId('lobby-join-red-clueGiver')).toBeVisible({ timeout: 10000 });

    // ========================================
    // Step 2: Other 3 players join the room
    // ========================================
    for (let i = 1; i < 4; i++) {
      await pages[i].goto('/');
      await pages[i].getByTestId('home-name-input').fill(playerNames[i]);
      await pages[i].getByTestId('home-code-input').fill(roomCode!);
      await pages[i].getByTestId('home-join-btn').click();

      // Wait for room to load
      await expect(pages[i].getByTestId('lobby-join-red-clueGiver')).toBeVisible({ timeout: 10000 });
    }

    // Verify all players see each other (check on first page)
    for (const name of playerNames) {
      await waitForPlayerVisible(pages[0], name);
    }

    // ========================================
    // Step 3: Assign teams manually (sequential to avoid Firebase race)
    // ========================================
    // Player 0 (RedClue) - joins red clue giver
    await pages[0].getByTestId('lobby-join-red-clueGiver').click();
    await pages[0].waitForTimeout(500); // Let Firebase sync
    
    // Player 1 (RedGuess) - joins red guesser
    await pages[1].getByTestId('lobby-join-red-guesser').click();
    await pages[1].waitForTimeout(500);
    
    // Player 2 (BlueClue) - joins blue clue giver
    await pages[2].getByTestId('lobby-join-blue-clueGiver').click();
    await pages[2].waitForTimeout(500);
    
    // Player 3 (BlueGuess) - joins blue guesser
    await pages[3].getByTestId('lobby-join-blue-guesser').click();

    // Wait for start button to be enabled (indicates all roles assigned)
    // Use longer timeout for production where Firebase sync takes longer
    const startButton = pages[0].getByTestId('lobby-start-btn');
    await expect(startButton).toBeEnabled({ timeout: 20000 });

    // ========================================
    // Step 4: Owner starts the game
    // ========================================
    await startButton.click();

    // Wait for game to start - board should be visible
    await expect(pages[0].getByTestId('board-card-0')).toBeVisible({ timeout: 10000 });

    // All players should see the board
    for (const page of pages) {
      await expect(page.getByTestId('board-card-0')).toBeVisible({ timeout: 5000 });
    }

    // ========================================
    // Step 5: Determine current team and give clue
    // ========================================
    // Check which team goes first by looking at the clue input visibility
    // The clue giver of the current team should see the clue input
    let clueGiverPage: Page;
    let guesserPage: Page;

    // Try red clue giver first
    const redClueInput = pages[0].getByTestId('game-clue-input');
    const isRedTurn = await redClueInput.isVisible().catch(() => false);

    if (isRedTurn) {
      clueGiverPage = pages[0]; // RedClue
      guesserPage = pages[1]; // RedGuess
    } else {
      clueGiverPage = pages[2]; // BlueClue
      guesserPage = pages[3]; // BlueGuess
    }

    // Clue giver fills in clue (use a word unlikely to be on board)
    const clueInput = clueGiverPage.getByTestId('game-clue-input');
    await expect(clueInput).toBeVisible({ timeout: 5000 });
    await clueInput.fill('TESTING');
    
    const clueCountInput = clueGiverPage.getByTestId('game-clue-count');
    await clueCountInput.fill('2');
    
    await clueGiverPage.getByTestId('game-clue-btn').click();

    // Wait for clue to be displayed (clue input should disappear)
    await expect(clueInput).not.toBeVisible({ timeout: 5000 });

    // ========================================
    // Step 6: Guesser votes and reveals a card
    // ========================================
    // Guesser clicks on a card to vote
    const cardToClick = guesserPage.getByTestId('board-card-12'); // Middle card
    await cardToClick.click();

    // Wait for reveal button to appear (vote was registered)
    const revealButton = guesserPage.getByTestId('board-reveal-12');
    await expect(revealButton).toBeVisible({ timeout: 5000 });
    await revealButton.click();

    // ========================================
    // Step 7: Verify card was revealed
    // ========================================
    // The reveal button should be gone now
    await expect(revealButton).not.toBeVisible({ timeout: 5000 });

    // ========================================
    // Step 8: Verify game state - game board still functional
    // ========================================
    await expect(pages[0].getByTestId('board-card-0')).toBeVisible();
    
    // The revealed card should stay visible (just different styling)
    const revealedCard = pages[0].getByTestId('board-card-12');
    await expect(revealedCard).toBeVisible();

    console.log('Full game flow test completed successfully!');
  });

  test('randomize teams and start game', async ({ context }) => {
    test.setTimeout(120000); // 2 minutes for multi-player test with Firebase latency
    // Create 4 browser pages
    const pages = await Promise.all([
      context.newPage(),
      context.newPage(),
      context.newPage(),
      context.newPage(),
    ]);

    // First player creates room
    await pages[0].goto('/');
    await pages[0].getByTestId('home-name-input').fill('Player1');
    await pages[0].getByTestId('home-create-btn').click();

    // Wait for navigation and get room code
    await expect(pages[0]).toHaveURL(/\/room\/[A-Z0-9]+/);
    const url = pages[0].url();
    const roomCode = url.match(/\/room\/([A-Z0-9]+)/)?.[1];
    expect(roomCode).toBeTruthy();

    await expect(pages[0].getByTestId('lobby-join-red-clueGiver')).toBeVisible({ timeout: 10000 });

    // Other players join
    for (let i = 1; i < 4; i++) {
      await pages[i].goto('/');
      await pages[i].getByTestId('home-name-input').fill(`Player${i + 1}`);
      await pages[i].getByTestId('home-code-input').fill(roomCode!);
      await pages[i].getByTestId('home-join-btn').click();
      await expect(pages[i].getByTestId('lobby-join-red-clueGiver')).toBeVisible({ timeout: 10000 });
    }

    // Wait for all players to be visible (instead of arbitrary timeout)
    for (let i = 1; i <= 4; i++) {
      await waitForPlayerVisible(pages[0], `Player${i}`);
    }

    // Owner clicks randomize
    const randomizeBtn = pages[0].getByTestId('lobby-randomize-btn');
    await expect(randomizeBtn).toBeEnabled({ timeout: 10000 });
    await randomizeBtn.click();

    // Wait for start button to be enabled (indicates randomization complete)
    const startBtn = pages[0].getByTestId('lobby-start-btn');
    await expect(startBtn).toBeEnabled({ timeout: 15000 });
    await startBtn.click();

    // Game should start - board visible
    await expect(pages[0].getByTestId('board-card-0')).toBeVisible({ timeout: 15000 });

    console.log('Randomize and start game test completed!');
  });

  test('play full game until one team wins', async ({ context }) => {
    test.setTimeout(120000); // 2 minutes for full game test
    // Create 4 browser pages for 4 players
    const pages = await Promise.all([
      context.newPage(),
      context.newPage(),
      context.newPage(),
      context.newPage(),
    ]);

    const playerNames = ['RedClue', 'RedGuess', 'BlueClue', 'BlueGuess'];

    // ========================================
    // Setup: Create room and join all players
    // ========================================
    await pages[0].goto('/');
    await pages[0].getByTestId('home-name-input').fill(playerNames[0]);
    await pages[0].getByTestId('home-create-btn').click();
    await expect(pages[0]).toHaveURL(/\/room\/[A-Z0-9]+/);
    
    const url = pages[0].url();
    const roomCode = url.match(/\/room\/([A-Z0-9]+)/)?.[1];
    expect(roomCode).toBeTruthy();
    await expect(pages[0].getByTestId('lobby-join-red-clueGiver')).toBeVisible({ timeout: 10000 });

    // Other players join
    for (let i = 1; i < 4; i++) {
      await pages[i].goto('/');
      await pages[i].getByTestId('home-name-input').fill(playerNames[i]);
      await pages[i].getByTestId('home-code-input').fill(roomCode!);
      await pages[i].getByTestId('home-join-btn').click();
      await expect(pages[i].getByTestId('lobby-join-red-clueGiver')).toBeVisible({ timeout: 10000 });
    }

    // ========================================
    // Assign teams (sequential to avoid Firebase race)
    // ========================================
    await pages[0].getByTestId('lobby-join-red-clueGiver').click();
    await pages[0].waitForTimeout(500);
    await pages[1].getByTestId('lobby-join-red-guesser').click();
    await pages[1].waitForTimeout(500);
    await pages[2].getByTestId('lobby-join-blue-clueGiver').click();
    await pages[2].waitForTimeout(500);
    await pages[3].getByTestId('lobby-join-blue-guesser').click();
    
    // Wait for start button to be enabled (longer timeout for production)
    const startButton = pages[0].getByTestId('lobby-start-btn');
    await expect(startButton).toBeEnabled({ timeout: 20000 });

    // ========================================
    // Start game
    // ========================================
    await startButton.click();
    await expect(pages[0].getByTestId('board-card-0')).toBeVisible({ timeout: 15000 });

    // ========================================
    // Determine first team and get card info
    // ========================================
    const redCluePage = pages[0];
    const redGuessPage = pages[1];
    const blueCluePage = pages[2];
    const blueGuessPage = pages[3];

    // Check who goes first by seeing who has clue input
    const isRedFirst = await redCluePage.getByTestId('game-clue-input').isVisible().catch(() => false);

    let firstClueGiver: Page, firstGuesser: Page, firstTeam: 'red' | 'blue';
    let secondClueGiver: Page, secondGuesser: Page, secondTeam: 'red' | 'blue';

    if (isRedFirst) {
      firstClueGiver = redCluePage;
      firstGuesser = redGuessPage;
      firstTeam = 'red';
      secondClueGiver = blueCluePage;
      secondGuesser = blueGuessPage;
      secondTeam = 'blue';
    } else {
      firstClueGiver = blueCluePage;
      firstGuesser = blueGuessPage;
      firstTeam = 'blue';
      secondClueGiver = redCluePage;
      secondGuesser = redGuessPage;
      secondTeam = 'red';
    }

    // Get second team's cards (they will win)
    const winningTeamCards = await getTeamCards(secondClueGiver, secondTeam);
    console.log(`${secondTeam} team has ${winningTeamCards.length} cards: ${winningTeamCards.join(', ')}`);

    // ========================================
    // Turn 1: First team gives clue, then ends turn
    // ========================================
    console.log(`Turn 1: ${firstTeam} team's turn`);
    
    const firstClueInput = firstClueGiver.getByTestId('game-clue-input');
    await expect(firstClueInput).toBeVisible({ timeout: 5000 });
    await firstClueInput.fill('RANDOM');
    await firstClueGiver.getByTestId('game-clue-count').fill('1');
    await firstClueGiver.getByTestId('game-clue-btn').click();

    // Wait for clue to be submitted (input disappears)
    await expect(firstClueInput).not.toBeVisible({ timeout: 5000 });

    // First guesser ends turn without guessing (to give second team their turn)
    const endTurnBtn = firstGuesser.getByTestId('game-end-turn-btn');
    await expect(endTurnBtn).toBeVisible({ timeout: 5000 });
    await endTurnBtn.click();

    // Wait for turn to change (second team's clue input appears)
    const secondClueInput = secondClueGiver.getByTestId('game-clue-input');
    await expect(secondClueInput).toBeVisible({ timeout: 5000 });

    // ========================================
    // Turn 2: Second team gives clue for ALL their cards
    // ========================================
    console.log(`Turn 2: ${secondTeam} team's turn - going for the win!`);
    
    await secondClueInput.fill('WINNING');
    await secondClueGiver.getByTestId('game-clue-count').fill(String(winningTeamCards.length));
    await secondClueGiver.getByTestId('game-clue-btn').click();

    // Wait for clue to be submitted
    await expect(secondClueInput).not.toBeVisible({ timeout: 5000 });

    // Second guesser guesses ALL their team's cards
    for (let i = 0; i < winningTeamCards.length; i++) {
      const cardIndex = winningTeamCards[i];
      console.log(`  Guessing card ${i + 1}/${winningTeamCards.length}: index ${cardIndex}`);

      // Vote for the card
      const card = secondGuesser.getByTestId(`board-card-${cardIndex}`);
      
      // Check if card is already revealed (shouldn't be, but safety check)
      const isDisabled = await card.isDisabled().catch(() => true);
      if (isDisabled) {
        console.log(`  Card ${cardIndex} already revealed, skipping`);
        continue;
      }

      await card.click();

      // Wait for reveal button to appear
      const revealBtn = secondGuesser.getByTestId(`board-reveal-${cardIndex}`);
      await expect(revealBtn).toBeVisible({ timeout: 5000 });
      await revealBtn.click();

      // Wait for reveal button to disappear (card revealed)
      await expect(revealBtn).not.toBeVisible({ timeout: 5000 });

      // Check if game is over (after each reveal)
      const gameOverPanel = secondGuesser.getByTestId('game-over-panel');
      const isGameOver = await gameOverPanel.isVisible().catch(() => false);
      
      if (isGameOver) {
        console.log(`  Game ended after revealing card ${cardIndex}!`);
        break;
      }
    }

    // ========================================
    // Assert: Game Over screen shows winner
    // ========================================
    console.log('Verifying game over state...');

    // Wait for game over panel using proper test ID
    await expect(pages[0].getByTestId('game-over-panel')).toBeVisible({ timeout: 5000 });
    
    // Verify winner text shows the correct team
    const winnerText = pages[0].getByTestId('game-winner-text');
    await expect(winnerText).toBeVisible({ timeout: 3000 });
    await expect(winnerText).toContainText(`${secondTeam.toUpperCase()} Team Wins`);

    // Verify all players see game over panel
    for (const page of pages) {
      await expect(page.getByTestId('game-over-panel')).toBeVisible({ timeout: 3000 });
    }

    // Verify rematch button is available (indicates game truly ended)
    const rematchBtn = pages[0].getByTestId('game-rematch-btn');
    await expect(rematchBtn).toBeVisible({ timeout: 3000 });

    console.log(`Full game completed! ${secondTeam.toUpperCase()} team wins!`);
  });
});
