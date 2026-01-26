import { test, expect, Page } from '@playwright/test';

/**
 * Full game flow E2E test.
 * 
 * Tests the complete flow:
 * 1. 4 players join a room
 * 2. Players select teams (or use randomize)
 * 3. Owner starts the game
 * 4. Spymaster gives a clue
 * 5. Operative votes and reveals a card
 * 6. Turn changes appropriately
 */

/**
 * Helper: Get card indices by team from spymaster's view
 * Spymaster cards have distinctive border colors
 */
async function getTeamCards(spymasterPage: Page, team: 'red' | 'blue'): Promise<number[]> {
  const borderClass = team === 'red' ? 'border-red-500' : 'border-blue-500';
  
  const indices: number[] = [];
  for (let i = 0; i < 25; i++) {
    const card = spymasterPage.getByTestId(`board-card-${i}`);
    const classes = await card.getAttribute('class');
    if (classes?.includes(borderClass)) {
      indices.push(i);
    }
  }
  return indices;
}

/**
 * Helper: Get unrevealed cards (no line-through class)
 */
async function getUnrevealedFromList(page: Page, cardIndices: number[]): Promise<number[]> {
  const unrevealed: number[] = [];
  for (const i of cardIndices) {
    const card = page.getByTestId(`board-card-${i}`);
    const classes = await card.getAttribute('class');
    if (!classes?.includes('line-through')) {
      unrevealed.push(i);
    }
  }
  return unrevealed;
}

test.describe('Full Game Flow', () => {
  test('complete game flow with 4 players', async ({ context }) => {
    // Create 4 browser pages for 4 players
    const pages = await Promise.all([
      context.newPage(),
      context.newPage(),
      context.newPage(),
      context.newPage(),
    ]);

    const playerNames = ['RedSpy', 'RedOp', 'BlueSpy', 'BlueOp'];

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
    await expect(pages[0].getByTestId('lobby-join-red-spymaster')).toBeVisible({ timeout: 10000 });

    // ========================================
    // Step 2: Other 3 players join the room
    // ========================================
    for (let i = 1; i < 4; i++) {
      await pages[i].goto('/');
      await pages[i].getByTestId('home-name-input').fill(playerNames[i]);
      await pages[i].getByTestId('home-code-input').fill(roomCode!);
      await pages[i].getByTestId('home-join-btn').click();

      // Wait for room to load
      await expect(pages[i].getByTestId('lobby-join-red-spymaster')).toBeVisible({ timeout: 10000 });
    }

    // Verify all players see each other (check on first page)
    // Use .first() since player name may appear multiple times in UI
    for (const name of playerNames) {
      await expect(pages[0].getByText(name).first()).toBeVisible({ timeout: 5000 });
    }

    // ========================================
    // Step 3: Assign teams manually
    // ========================================
    // Player 0 (RedSpy) - joins red spymaster
    await pages[0].getByTestId('lobby-join-red-spymaster').click();
    
    // Player 1 (RedOp) - joins red operative
    await pages[1].getByTestId('lobby-join-red-operative').click();
    
    // Player 2 (BlueSpy) - joins blue spymaster
    await pages[2].getByTestId('lobby-join-blue-spymaster').click();
    
    // Player 3 (BlueOp) - joins blue operative
    await pages[3].getByTestId('lobby-join-blue-operative').click();

    // Wait for all assignments to propagate
    await pages[0].waitForTimeout(500);

    // ========================================
    // Step 4: Owner starts the game
    // ========================================
    const startButton = pages[0].getByTestId('lobby-start-btn');
    await expect(startButton).toBeEnabled({ timeout: 5000 });
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
    // The spymaster of the current team should see the clue input
    let spymasterPage: Page;
    let operativePage: Page;

    // Try red spymaster first
    const redSpyClueInput = pages[0].getByTestId('game-clue-input');
    const isRedTurn = await redSpyClueInput.isVisible().catch(() => false);

    if (isRedTurn) {
      spymasterPage = pages[0]; // RedSpy
      operativePage = pages[1]; // RedOp
    } else {
      spymasterPage = pages[2]; // BlueSpy
      operativePage = pages[3]; // BlueOp
    }

    // Spymaster fills in clue (use a word unlikely to be on board)
    const clueInput = spymasterPage.getByTestId('game-clue-input');
    await expect(clueInput).toBeVisible({ timeout: 5000 });
    await clueInput.fill('TESTING');
    
    const clueCountInput = spymasterPage.getByTestId('game-clue-count');
    await clueCountInput.fill('2');
    
    await spymasterPage.getByTestId('game-clue-btn').click();

    // Wait for clue to be processed
    await spymasterPage.waitForTimeout(500);

    // ========================================
    // Step 6: Operative votes and reveals a card
    // ========================================
    // Operative clicks on a card to vote
    const cardToClick = operativePage.getByTestId('board-card-12'); // Middle card
    await cardToClick.click();

    // Wait for vote to register
    await operativePage.waitForTimeout(300);

    // With 1 operative, 1 vote is enough - reveal button should appear
    const revealButton = operativePage.getByTestId('board-reveal-12');
    await expect(revealButton).toBeVisible({ timeout: 3000 });
    await revealButton.click();

    // Wait for reveal to process
    await operativePage.waitForTimeout(500);

    // ========================================
    // Step 7: Verify card was revealed
    // ========================================
    // The reveal button should be gone now
    await expect(revealButton).not.toBeVisible({ timeout: 3000 });

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

    await expect(pages[0].getByTestId('lobby-join-red-spymaster')).toBeVisible({ timeout: 10000 });

    // Other players join
    for (let i = 1; i < 4; i++) {
      await pages[i].goto('/');
      await pages[i].getByTestId('home-name-input').fill(`Player${i + 1}`);
      await pages[i].getByTestId('home-code-input').fill(roomCode!);
      await pages[i].getByTestId('home-join-btn').click();
      await expect(pages[i].getByTestId('lobby-join-red-spymaster')).toBeVisible({ timeout: 10000 });
    }

    // Wait for all players to be visible
    await pages[0].waitForTimeout(500);

    // Owner clicks randomize
    const randomizeBtn = pages[0].getByTestId('lobby-randomize-btn');
    await expect(randomizeBtn).toBeEnabled({ timeout: 5000 });
    await randomizeBtn.click();

    // Wait for randomization
    await pages[0].waitForTimeout(500);

    // Start game should now be enabled
    const startBtn = pages[0].getByTestId('lobby-start-btn');
    await expect(startBtn).toBeEnabled({ timeout: 5000 });
    await startBtn.click();

    // Game should start - board visible
    await expect(pages[0].getByTestId('board-card-0')).toBeVisible({ timeout: 10000 });

    console.log('Randomize and start game test completed!');
  });

  test('play full game until one team wins', async ({ context }) => {
    // Create 4 browser pages for 4 players
    const pages = await Promise.all([
      context.newPage(),
      context.newPage(),
      context.newPage(),
      context.newPage(),
    ]);

    const playerNames = ['RedSpy', 'RedOp', 'BlueSpy', 'BlueOp'];

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
    await expect(pages[0].getByTestId('lobby-join-red-spymaster')).toBeVisible({ timeout: 10000 });

    // Other players join
    for (let i = 1; i < 4; i++) {
      await pages[i].goto('/');
      await pages[i].getByTestId('home-name-input').fill(playerNames[i]);
      await pages[i].getByTestId('home-code-input').fill(roomCode!);
      await pages[i].getByTestId('home-join-btn').click();
      await expect(pages[i].getByTestId('lobby-join-red-spymaster')).toBeVisible({ timeout: 10000 });
    }

    // ========================================
    // Assign teams
    // ========================================
    await pages[0].getByTestId('lobby-join-red-spymaster').click();
    await pages[1].getByTestId('lobby-join-red-operative').click();
    await pages[2].getByTestId('lobby-join-blue-spymaster').click();
    await pages[3].getByTestId('lobby-join-blue-operative').click();
    await pages[0].waitForTimeout(500);

    // ========================================
    // Start game
    // ========================================
    const startButton = pages[0].getByTestId('lobby-start-btn');
    await expect(startButton).toBeEnabled({ timeout: 5000 });
    await startButton.click();
    await expect(pages[0].getByTestId('board-card-0')).toBeVisible({ timeout: 10000 });

    // ========================================
    // Determine first team and get card info
    // ========================================
    const redSpyPage = pages[0];
    const redOpPage = pages[1];
    const blueSpyPage = pages[2];
    const blueOpPage = pages[3];

    // Check who goes first by seeing who has clue input
    const isRedFirst = await redSpyPage.getByTestId('game-clue-input').isVisible().catch(() => false);

    let firstSpymaster: Page, firstOperative: Page, firstTeam: 'red' | 'blue';
    let secondSpymaster: Page, secondOperative: Page, secondTeam: 'red' | 'blue';

    if (isRedFirst) {
      firstSpymaster = redSpyPage;
      firstOperative = redOpPage;
      firstTeam = 'red';
      secondSpymaster = blueSpyPage;
      secondOperative = blueOpPage;
      secondTeam = 'blue';
    } else {
      firstSpymaster = blueSpyPage;
      firstOperative = blueOpPage;
      firstTeam = 'blue';
      secondSpymaster = redSpyPage;
      secondOperative = redOpPage;
      secondTeam = 'red';
    }

    // Get second team's cards (they will win)
    const winningTeamCards = await getTeamCards(secondSpymaster, secondTeam);
    console.log(`${secondTeam} team has ${winningTeamCards.length} cards: ${winningTeamCards.join(', ')}`);

    // ========================================
    // Turn 1: First team gives clue, guesses ONE card (intentionally wrong to pass turn)
    // ========================================
    console.log(`Turn 1: ${firstTeam} team's turn`);
    
    await expect(firstSpymaster.getByTestId('game-clue-input')).toBeVisible({ timeout: 5000 });
    await firstSpymaster.getByTestId('game-clue-input').fill('RANDOM');
    await firstSpymaster.getByTestId('game-clue-count').fill('1');
    await firstSpymaster.getByTestId('game-clue-btn').click();
    await firstSpymaster.waitForTimeout(500);

    // First operative ends turn without guessing (to give second team their turn)
    await expect(firstOperative.getByTestId('game-end-turn-btn')).toBeVisible({ timeout: 5000 });
    await firstOperative.getByTestId('game-end-turn-btn').click();
    await firstOperative.waitForTimeout(500);

    // ========================================
    // Turn 2: Second team gives clue for ALL their cards
    // ========================================
    console.log(`Turn 2: ${secondTeam} team's turn - going for the win!`);
    
    await expect(secondSpymaster.getByTestId('game-clue-input')).toBeVisible({ timeout: 5000 });
    await secondSpymaster.getByTestId('game-clue-input').fill('WINNING');
    await secondSpymaster.getByTestId('game-clue-count').fill(String(winningTeamCards.length));
    await secondSpymaster.getByTestId('game-clue-btn').click();
    await secondSpymaster.waitForTimeout(500);

    // Second operative guesses ALL their team's cards
    for (let i = 0; i < winningTeamCards.length; i++) {
      const cardIndex = winningTeamCards[i];
      console.log(`  Guessing card ${i + 1}/${winningTeamCards.length}: index ${cardIndex}`);

      // Vote for the card
      const card = secondOperative.getByTestId(`board-card-${cardIndex}`);
      
      // Check if card is already revealed (shouldn't be, but safety check)
      const classes = await card.getAttribute('class');
      if (classes?.includes('line-through')) {
        console.log(`  Card ${cardIndex} already revealed, skipping`);
        continue;
      }

      await card.click();
      await secondOperative.waitForTimeout(300);

      // Reveal it
      const revealBtn = secondOperative.getByTestId(`board-reveal-${cardIndex}`);
      await expect(revealBtn).toBeVisible({ timeout: 3000 });
      await revealBtn.click();
      await secondOperative.waitForTimeout(500);

      // Check if game is over (after each reveal)
      const gameOverText = secondOperative.getByText(/Game Over/i);
      const isGameOver = await gameOverText.isVisible().catch(() => false);
      
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
