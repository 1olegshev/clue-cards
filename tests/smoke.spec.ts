import { test, expect } from '@playwright/test';

test.describe('Smoke Tests', () => {
  test('home page loads correctly', async ({ page }) => {
    await page.goto('/');
    
    // Check title and main elements using specific selectors
    await expect(page.getByRole('heading', { name: 'Clue Cards' })).toBeVisible();
    await expect(page.getByTestId('home-name-input')).toBeVisible();
    await expect(page.getByTestId('home-create-btn')).toBeVisible();
    await expect(page.getByTestId('home-join-btn')).toBeVisible();
  });

  test('can create a room', async ({ page }) => {
    await page.goto('/');
    
    // Enter name and create room
    await page.getByTestId('home-name-input').fill('TestPlayer');
    await page.getByTestId('home-create-btn').click();
    
    // Should redirect to room page
    await expect(page).toHaveURL(/\/room\/[A-Z0-9]+/);
    
    // Room should load with lobby visible - use data-testid for reliability
    await expect(page.getByTestId('lobby-join-red-spymaster')).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId('lobby-join-blue-spymaster')).toBeVisible();
  });

  test('can join existing room with code', async ({ page, context }) => {
    // First player creates room
    await page.goto('/');
    await page.getByTestId('home-name-input').fill('Player1');
    await page.getByTestId('home-create-btn').click();
    
    // Wait for navigation and get room code from URL
    await expect(page).toHaveURL(/\/room\/[A-Z0-9]+/);
    const url = page.url();
    const roomCode = url.match(/\/room\/([A-Z0-9]+)/)?.[1];
    expect(roomCode).toBeTruthy();
    
    // Wait for lobby to load
    await expect(page.getByTestId('lobby-join-red-spymaster')).toBeVisible({ timeout: 10000 });
    
    // Second player joins with code
    const page2 = await context.newPage();
    await page2.goto('/');
    await page2.getByTestId('home-name-input').fill('Player2');
    await page2.getByTestId('home-code-input').fill(roomCode!);
    await page2.getByTestId('home-join-btn').click();
    
    // Should be in same room (URL may have query params)
    await expect(page2).toHaveURL(new RegExp(`/room/${roomCode}`));
    await expect(page2.getByTestId('lobby-join-red-spymaster')).toBeVisible({ timeout: 10000 });
    
    // Player1 should see Player2 joined
    await expect(page.getByText('Player2')).toBeVisible({ timeout: 5000 });
  });
});
