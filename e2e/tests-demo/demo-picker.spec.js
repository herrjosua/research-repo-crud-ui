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

    // The fictional-data disclaimer is read before anyone picks a profile.
    await expect(page.getByText('Demonstration environment', { exact: true })).toBeVisible();

    // Accessibility scan of the picker screen itself — a new screen that's
    // never been scanned by the existing (DEMO_MODE=false) E2E suite.
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);

    await page.getByRole('button', { name: /Priya Patel/ }).click();

    // Confirm a genuine, real login happened — the dashboard actually rendered.
    await expect(page.getByRole('button', { name: 'New session' })).toBeVisible();

    // The header greeting uses the logged-in persona's own name (git_name
    // from GET /auth/me), not a generic label — confirms it's wired to the
    // real session and not hardcoded to whichever persona was clicked first.
    await expect(page.getByText('Welcome, Priya Patel')).toBeVisible();

    // The disclaimer stays up on the dashboard, not just the picker.
    await expect(page.getByText('Demonstration environment', { exact: true })).toBeVisible();

    // Accessibility scan of the demo dashboard, which carries the banner the
    // DEMO_MODE=false dashboard scan never sees.
    const dashboardResults = await new AxeBuilder({ page }).analyze();
    expect(dashboardResults.violations).toEqual([]);
});

// 672px is the md floor (see tests/responsive.spec.js); the banner must not
// push either demo screen into horizontal scroll there.
test('at 672px the demo banner fits on the picker and the dashboard', async ({ page }) => {
    await page.setViewportSize({ width: 672, height: 800 });

    async function expectNoHorizontalOverflow() {
        const { scrollWidth, clientWidth } = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
        }));
        expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
    }

    await page.goto('/');
    await expect(page.getByText('Demonstration environment', { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow();

    await page.getByRole('button', { name: /Sam Okafor/ }).click();
    await expect(page.getByRole('button', { name: 'New session' })).toBeVisible();
    await expect(page.getByText('Demonstration environment', { exact: true })).toBeVisible();
    await expectNoHorizontalOverflow();
});