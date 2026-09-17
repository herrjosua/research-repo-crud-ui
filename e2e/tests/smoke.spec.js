import { test, expect } from '@playwright/test';

test('the login page loads', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByLabel('Username')).toBeVisible();
});