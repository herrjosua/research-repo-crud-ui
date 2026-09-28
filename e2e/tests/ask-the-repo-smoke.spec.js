import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

test('Ask the Repo is reachable from primary nav, its tabs switch, and the theme toggle persists', async ({ page, request }) => {
    // randomUUID, not Date.now(): parallel workers can call this in the same
    // millisecond and collide on the username's UNIQUE constraint otherwise.
    const username = `e2e-tester-${randomUUID()}`;
    const password = 'a-real-password-123';

    const signupRes = await request.post('/api/auth/signup', {
        data: { username, password, gitName: 'E2E Tester', gitEmail: 'e2e-tester@example.com' },
    });
    expect(signupRes.ok()).toBe(true);

    await page.goto('/');
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Log in' }).click();

    // --- Starts on the dashboard, not Ask the Repo ---
    await expect(page.getByRole('button', { name: 'New session' })).toBeVisible();

    // --- Reach Ask the Repo via the real primary nav, not a direct URL ---
    await page.getByRole('link', { name: 'Ask the Repo' }).click();
    await expect(page.getByRole('button', { name: 'New session' })).toHaveCount(0);
    const breadcrumb = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(breadcrumb).toBeVisible();
    await expect(breadcrumb.getByText('Ask the Repo')).toBeVisible(); // current-page crumb

    // --- Ask tab is selected by default ---
    const askTab = page.getByRole('tab', { name: 'Ask' });
    const insightsTab = page.getByRole('tab', { name: 'Saved Insights' });
    await expect(askTab).toHaveAttribute('aria-selected', 'true');
    // Real chat panel (Story 4): starter questions on the empty state, plus
    // the composer itself — not just "the placeholder text is gone".
    await expect(page.getByText('Try asking')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Ask a question about the research' })).toBeVisible();

    // --- Tabs switch views ---
    await insightsTab.click();
    await expect(insightsTab).toHaveAttribute('aria-selected', 'true');
    // Real Saved Insights view (Story 6): its heading, the session-only
    // notice, and — since nothing was saved in this flow — the empty state.
    await expect(page.getByRole('heading', { name: 'Saved insights' })).toBeVisible();
    // Exact: the Ask tab's left rail (mounted, but hidden) has its own
    // "Session only: conversations…" note.
    await expect(page.getByText('Session only', { exact: true })).toBeVisible();
    await expect(page.getByText('No saved insights yet')).toBeVisible();

    // --- Nav back to Research Records leaves Ask the Repo ---
    await page.getByRole('link', { name: 'Research Records' }).click();
    await expect(page.getByRole('button', { name: 'New session' })).toBeVisible();

    // --- Dark/light toggle: starts light (no stored preference, light OS default in CI) ---
    const themeToggle = page.getByRole('button', { name: 'Switch to dark mode' });
    await expect(themeToggle).toBeVisible();
    await expect(page.locator('body')).not.toHaveClass(/cds--g100/);

    await themeToggle.click();
    await expect(page.locator('body')).toHaveClass(/cds--g100/);
    await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();

    // --- Persisted: a reload keeps the chosen theme ---
    await page.reload();
    await expect(page.locator('body')).toHaveClass(/cds--g100/);
    await expect(page.getByRole('button', { name: 'Switch to light mode' })).toBeVisible();
});
