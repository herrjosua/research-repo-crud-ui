import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { STABLE_RAW_SESSION_TITLE } from '../support/fixtureRecords';

// Where focus goes when a dialog opens, how Escape closes it, and where focus
// returns (v1.3.6.64). Found with a real screen reader in Chrome: closing a
// dialog dropped the reader onto the page title, and Escape from Close took two
// presses because Close's tooltip swallowed the first.

test.beforeEach(async ({ page, request }) => {
    const username = `e2e-tester-${randomUUID()}`;
    const password = 'a-real-password-123';

    await request.post('/api/auth/signup', {
        data: { username, password, gitName: 'E2E Tester', gitEmail: 'e2e-tester@example.com' },
    });

    await page.goto('/');
    await page.getByLabel('Username').fill(username);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('button', { name: 'New session' })).toBeVisible();
});

test('closing a record returns focus to the card that opened it', async ({ page }) => {
    const tile = page.locator('.cds--tile--clickable', { hasText: STABLE_RAW_SESSION_TITLE });
    await tile.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    // Focus settles on the title once the record has loaded.
    await expect(page.getByRole('dialog').locator('[data-modal-primary-focus]')).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(tile).toBeFocused();
});

test('New session opens on the Title field, Escape closes it in one press, and focus returns to the button', async ({ page }) => {
    const opener = page.getByRole('button', { name: 'New session' });
    await opener.focus();
    await page.keyboard.press('Enter');

    const dialog = page.getByRole('dialog', { name: 'New research session' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel(/^Title/)).toBeFocused();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(opener).toBeFocused();
});

test('Escape from the Close button closes a dialog in one press, not two', async ({ page }) => {
    const tile = page.locator('.cds--tile--clickable', { hasText: STABLE_RAW_SESSION_TITLE });
    await tile.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();

    // Close's tooltip opens on focus and used to swallow the first Escape.
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).focus();
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('an empty submit moves focus to the Title field, marked invalid', async ({ page }) => {
    await page.getByRole('button', { name: 'New session' }).click();
    const dialog = page.getByRole('dialog', { name: 'New research session' });
    await dialog.getByRole('button', { name: 'Create session' }).click();

    const title = dialog.getByLabel(/^Title/);
    await expect(title).toBeFocused();
    await expect(title).toHaveAttribute('aria-invalid', 'true');
});
