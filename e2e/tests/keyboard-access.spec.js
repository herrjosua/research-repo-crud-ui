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

test.describe('the record detail modal only shows a focus ring on its close button for real keyboard focus', () => {
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

    // Carbon's Modal always moves focus to its close button on open, even
    // for a mouse-driven open — that's correct a11y behavior and isn't what
    // this checks. This checks that the ring itself, which is visual noise
    // for a mouse user, doesn't show in that case.
    test('a mouse-driven open does not show the ring', async ({ page }) => {
        const tile = page.locator('.cds--tile--clickable', { hasText: STABLE_RAW_SESSION_TITLE });
        await tile.click();

        const closeButton = page.getByRole('dialog').getByRole('button', { name: 'Close' });
        await expect(closeButton).toBeFocused();
        expect(await closeButton.evaluate((el) => el.matches(':focus-visible'))).toBe(false);
    });

    // The same automatic focus move as above, but this time triggered by a
    // keyboard open — the ring must still show, since this is the case a
    // keyboard user actually relies on to know where focus landed.
    test('a keyboard-driven open shows the ring', async ({ page }) => {
        const tile = page.locator('.cds--tile--clickable', { hasText: STABLE_RAW_SESSION_TITLE });
        await tile.focus();
        await page.keyboard.press('Enter');

        const closeButton = page.getByRole('dialog').getByRole('button', { name: 'Close' });
        await expect(closeButton).toBeFocused();
        expect(await closeButton.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
    });

    // Open with a mouse (ring suppressed, per the first case above), then
    // reach the close button again via a real Tab press — Carbon's focus
    // trap wraps Tab from the last tabbable element back to the first
    // (the close button). The ring must show here: this is a genuine
    // keyboard interaction, even though the same element was mouse-focused
    // moments earlier, so the earlier suppression must not stick around.
    test('a Tab press that wraps the focus trap back onto the close button shows the ring', async ({ page }) => {
        const tile = page.locator('.cds--tile--clickable', { hasText: STABLE_RAW_SESSION_TITLE });
        await tile.click();

        const closeButton = page.getByRole('dialog').getByRole('button', { name: 'Close' });
        await expect(closeButton).toBeFocused();
        expect(await closeButton.evaluate((el) => el.matches(':focus-visible'))).toBe(false);

        // Shift+Tab from the close button (the trap's first tabbable
        // element) wraps to the last one; Tab from there wraps forward
        // again, landing back on the close button.
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');

        await expect(closeButton).toBeFocused();
        expect(await closeButton.evaluate((el) => el.matches(':focus-visible'))).toBe(true);
    });
});
