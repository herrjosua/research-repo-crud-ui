import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('the demo picker shows all three profiles, passes an accessibility scan, and logs in with one click', async ({ page }) => {
    await page.goto('/');

    // The regular LoginForm should be entirely absent under DEMO_MODE — App.jsx
    // should have branched to the picker instead, not just added it alongside.
    await expect(page.getByLabel('Username')).not.toBeVisible();

    await expect(page.getByRole('button', { name: /Priya Patel/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Sam Okafor/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Jordan Lee/ })).toBeVisible();

    // Accessibility scan of the picker screen itself — a new screen that's
    // never been scanned by the existing (DEMO_MODE=false) E2E suite.
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);

    await page.getByRole('button', { name: /Priya Patel/ }).click();

    // Confirm a genuine, real login happened — the dashboard actually rendered.
    await expect(page.getByRole('button', { name: 'New session' })).toBeVisible();
});