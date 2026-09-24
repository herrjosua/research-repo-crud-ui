import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { STABLE_RAW_SESSION_TITLE } from '../support/fixtureRecords';

test('dashboard, record detail, and delete confirmation are all keyboard-operable and pass an accessibility scan', async ({ page, request }) => {
    // randomUUID, not Date.now(): parallel workers can call this in the same
    // millisecond and collide on the username's UNIQUE constraint otherwise.
    const username = `e2e-tester-${randomUUID()}`;
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

    // --- Open a fixture record's detail view via Enter, not a click ---
    // A specific record by title, not "the first tile", so list order and
    // records other specs create or delete in parallel don't matter.
    const tile = page.locator('.cds--tile--clickable', { hasText: STABLE_RAW_SESSION_TITLE });
    await tile.focus();
    await expect(tile).toBeFocused(); // confirms it's genuinely in the tab order at all
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

    // Carbon's outer <Modal> treats focus landing in this nested, portaled
    // confirm dialog as focus having escaped its own DOM subtree (its blur
    // handler has no notion of legitimately-stacked portaled modals) and
    // races its own confirm-dialog auto-focus effect to yank focus back onto
    // itself. RecordDetail explicitly re-asserts focus into the confirm
    // dialog's Cancel button to win that race deterministically — wait for
    // that real, meaningful precondition before testing Escape below.
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();

    // --- Escape closes the confirmation dialog first, not both at once ---
    await page.keyboard.press('Escape');
    await expect(confirmDialogs).toHaveCount(1);
    await expect(detailModal).toBeVisible(); // the underlying detail modal is still open

    // --- Escape again closes the detail modal, returning to the dashboard ---
    await page.keyboard.press('Escape');
    await expect(detailModal).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'New session' })).toBeVisible();
});
