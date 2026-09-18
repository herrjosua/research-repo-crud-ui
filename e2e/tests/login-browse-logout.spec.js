import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';

test('a real user can log in, browse, and log out — with an accessibility scan of the dashboard', async ({ page, request }) => {
    // randomUUID, not Date.now(): parallel workers can call this in the same
    // millisecond and collide on the username's UNIQUE constraint otherwise.
    const username = `e2e-tester-${randomUUID()}`;
    const password = 'a-real-password-123';

    // Seed a real user directly via the API — there's no signup screen yet
    // (useSignup() exists in api/auth.js but isn't wired to any UI), so this
    // is the only way to get a real account to log in with. The login itself,
    // right below, is still completely real — only account creation is
    // short-circuited here.
    const signupRes = await request.post('/api/auth/signup', {
        data: { username, password, gitName: 'E2E Tester', gitEmail: 'e2e-tester@example.com' },
    });
    expect(signupRes.ok()).toBe(true);

    await page.goto('/');

    // --- Accessibility scan of the login screen itself, before logging in ---
    // This screen was never actually scanned before — the only prior scan in
    // this test ran after login, against the dashboard.
    let results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);

    // --- Log in through the real LoginForm UI ---
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Log in' }).click();

    // --- Browse: confirm the dashboard actually rendered ---
    await expect(page.getByRole('button', { name: 'New session' })).toBeVisible();
    await expect(page.getByText(/of \d+ records/)).toBeVisible();

    // --- Accessibility scan of the real, logged-in dashboard ---
    results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);

    // --- Log out ---
    await page.getByRole('button', { name: 'Log out' }).click();

    // Confirm we're genuinely back at the login screen, not just that the
    // button click didn't error.
    await expect(page.getByLabel('Username')).toBeVisible();
});