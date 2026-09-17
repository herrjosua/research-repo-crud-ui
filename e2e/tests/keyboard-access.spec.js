import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test('dashboard, record detail, and delete confirmation are all keyboard-operable and pass an accessibility scan', async ({ page, request }) => {
    const username = `e2e-tester-${Date.now()}`;
    const password = 'a-real-password-123';

    await request.post('/api/auth/signup', {
        data: { username, password, gitName: 'E2E Tester', gitEmail: 'e2e-tester@example.com' },
    });

    await page.goto('/');

    // --- Log in entirely via keyboard, no mouse clicks ---
    await page.getByLabel('Username').focus();
    await page.keyboard.type(username);
    await page.keyboard.press('Tab');
    await page.keyboard.type(password);
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'New session' })).toBeVisible();

    // --- Open the first record's detail view via Enter, not a click ---
    // Targeted by Carbon's stable class rather than the tile's title text,
    // since that text is real research content that could change later.
    const firstTile = page.locator('.cds--tile--clickable').first();
    await firstTile.focus();
    await expect(firstTile).toBeFocused(); // confirms it's genuinely in the tab order at all
    await page.keyboard.press('Enter');

    const detailModal = page.getByRole('dialog');
    await expect(detailModal).toBeVisible();

    // Accessibility scan of the record detail modal — not covered by the
    // earlier login-browse-logout test, since that test never opens it.
    let results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);

    // --- Open the delete confirmation via keyboard ---
    await detailModal.getByRole('button', { name: 'Delete' }).focus();
    await page.keyboard.press('Enter');

    const confirmDialogs = page.getByRole('dialog');
    await expect(confirmDialogs).toHaveCount(2); // the detail modal, plus the nested confirm dialog on top of it

    // Accessibility scan of the nested delete-confirmation dialog.
    results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);

    // --- Escape closes the confirmation dialog first, not both at once ---
    await page.keyboard.press('Escape');
    await expect(confirmDialogs).toHaveCount(1);
    await expect(detailModal).toBeVisible(); // the underlying detail modal is still open

    // --- Escape again closes the detail modal, returning to the dashboard ---
    await page.keyboard.press('Escape');
    await expect(detailModal).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'New session' })).toBeVisible();
});