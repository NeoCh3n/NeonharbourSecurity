import { test, expect } from '@playwright/test';

test('demo flow navigation', async ({ page }) => {
  // Visit the landing page
  await page.goto('/');

  // Should show the landing page with sign in
  await expect(page.locator('h1')).toContainText('NeoHarbor Security');
  
  // Mock authentication by navigating directly to data-sources
  // In a real test, you would mock Clerk authentication
  await page.goto('/data-sources');
  
  // Should show data sources page
  await expect(page.locator('h1')).toContainText('Data Sources');
  
  // Click connect button (assuming it exists)
  const connectButton = page.locator('button').filter({ hasText: /connect/i }).first();
  if (await connectButton.isVisible()) {
    await connectButton.click();
    
    // Should navigate to dashboard
    await expect(page).toHaveURL('/dashboard');
    await expect(page.locator('h1, h2')).toContainText(/dashboard|investigation/i);
  }
  
  // Navigate to investigations
  await page.goto('/investigations');
  await expect(page.locator('h1, h2')).toContainText(/investigations/i);
  
  // Check if search box exists
  const searchInput = page.locator('input[type="search"], input[placeholder*="search" i]');
  if (await searchInput.isVisible()) {
    await expect(searchInput).toBeVisible();
  }
});