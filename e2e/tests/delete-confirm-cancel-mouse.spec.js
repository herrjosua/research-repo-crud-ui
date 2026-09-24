import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// Regression test for a bug where clicking Cancel with the MOUSE on the
// nested delete-confirmation dialog also closed the detail modal beneath it.
// A Playwright trial click (see responsive.spec.js's expectClickable) doesn't
// dispatch a real event, so it can't catch this — the bug only shows up on an
// actual dispatched click, which is what .click() below performs.
//
// Root cause: the confirm dialog is rendered via createPortal straight to
// document.body, so in real DOM terms it's a sibling of the outer detail
// modal, not a descendant. But createPortal keeps it a normal child in the
// REACT tree, and Carbon's Modal implements click-outside-to-close with a
// plain React onClick prop on its own outermost element — React bubbles
// synthetic events along the React tree, not the DOM tree, so a click
// anywhere inside the portaled confirm dialog (including its own Cancel
// button) still reaches the outer modal's onClick handler. That handler then
// does a DOM `.contains()` check against its own container, finds the real
// click target physically sitting in document.body instead, concludes the
// click landed "outside" itself, and closes too.
//
// Run at two widths, not just one: the bug is driven by React's synthetic
// event tree, not CSS, so it's width-independent — but that's exactly the
// kind of assumption worth locking in with a real assertion rather than
// leaving implicit. 672px is the app's supported floor (see
// responsive.spec.js); 1400px is a plain desktop width, well past Carbon's
// lg breakpoint.
for (const width of [672, 1400]) {
    test(`at ${width}px, clicking Cancel with the mouse on the delete confirmation closes only the confirm dialog`, async ({ page, request }) => {
        await page.setViewportSize({ width, height: 800 });

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
        await expect(page.getByRole('button', { name: 'New session' })).toBeVisible();

        // This spec deletes a record, so it creates its own (unique per width
        // and run) instead of touching the fixture records other specs open
        // in parallel. page.request shares the logged-in browser's cookie.
        const id = randomUUID();
        const title = `E2E delete target ${id}`;
        const createRes = await page.request.post('/api/sessions', {
            data: { mode: 'raw', title, type: 'interview', topicSlug: `e2e-delete-${id}` },
        });
        expect(createRes.status()).toBe(201);
        await page.reload();
        await page.getByRole('searchbox', { name: 'Search records' }).fill(title);
        const tile = page.locator('.cds--tile--clickable', { hasText: title });

        await tile.click();
        const detailModal = page.getByRole('dialog');
        await expect(detailModal).toBeVisible();

        await detailModal.getByRole('button', { name: 'Delete' }).click();
        const dialogs = page.getByRole('dialog');
        await expect(dialogs).toHaveCount(2); // the detail modal, plus the nested confirm dialog on top of it
        const confirmDialog = dialogs.last();

        // A real, dispatched mouse click — not a trial click.
        await confirmDialog.getByRole('button', { name: 'Cancel' }).click();

        // The confirm dialog is gone...
        await expect(dialogs).toHaveCount(1);
        // ...and the detail modal is still open underneath, not also closed.
        await expect(detailModal).toBeVisible();
        await expect(detailModal.getByRole('button', { name: 'Delete' })).toBeVisible();

        // Backdrop-click-to-close on the outer detail modal still works normally
        // when no confirm dialog is open on top of it.
        await page.mouse.click(5, 5);
        await expect(detailModal).not.toBeVisible();

        // The confirm dialog's own Delete (primary) button still closes both
        // modals correctly on an actual successful deletion — the one case where
        // closing both IS correct behavior.
        await tile.click();
        await expect(detailModal).toBeVisible();
        await detailModal.getByRole('button', { name: 'Delete' }).click();
        await expect(dialogs).toHaveCount(2);
        await dialogs.last().getByRole('button', { name: 'Delete' }).click();
        await expect(dialogs).toHaveCount(0);
        // ...and the record really is gone.
        await expect(tile).toHaveCount(0);
    });
}
