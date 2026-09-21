import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';

// Carbon's md breakpoint spans 672px–1055px. Phone-size (sm, below 672px) is
// deliberately out of scope for this app — it's a tool used on laptops and
// tablets — so 672px is the narrowest width tested. Both edges of the range
// are covered: the floor, where the sidebar column is tightest, and the last
// pixel before Carbon's lg layout takes over.
const MD_WIDTHS = [672, 1055];
const VIEWPORT_HEIGHT = 800;

async function expectNoHorizontalOverflow(page) {
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}

// Bounding-box checks rather than toBeVisible(): Playwright counts an element
// as "visible" even when it's rendered entirely off the right edge of the
// screen, which is exactly the failure mode a responsive test has to catch.
async function expectWithinViewport(locator, viewportWidth) {
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewportWidth);
}

// A trial click runs Playwright's full actionability checks (visible, stable,
// enabled, and — the important one here — not covered by another element
// that would intercept the click) without actually clicking.
async function expectClickable(locator) {
    await locator.scrollIntoViewIfNeeded();
    await locator.click({ trial: true });
}

for (const width of MD_WIDTHS) {
    test(`at ${width}px (Carbon md) the dashboard, all three modals, and both CKEditor toolbars fit and stay reachable`, async ({ page, request }) => {
        await page.setViewportSize({ width, height: VIEWPORT_HEIGHT });

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

        // --- Dashboard: no horizontal overflow, sidebar fits its column ---
        await expectNoHorizontalOverflow(page);

        const search = page.getByRole('searchbox', { name: 'Search records' });
        const tagFilter = page.getByRole('searchbox', { name: 'Filter tags' });
        const tagsGroup = page.getByRole('group', { name: /^Tags/ });
        const heading = page.getByRole('heading', { name: 'Research Records' });

        // Pins the shortened wording only. The old "Search by title or type"
        // placeholder was clipped to a few characters in the narrow sidebar;
        // "Search records" is shorter but still doesn't fully fit below ~900px
        // (Carbon's Search reserves room for its icon and clear button), so
        // this is a regression guard on the text, not a fits-in-the-box check.
        await expect(search).toHaveAttribute('placeholder', 'Search records');

        // The Filter-tags box sits in a <fieldset>, which by default refuses to
        // shrink below its content's minimum width and used to poke past its
        // column (and out of line with the Search box above it) at 672px.
        const searchBox = await search.boundingBox();
        const tagsGroupBox = await tagsGroup.boundingBox();
        expect(tagsGroupBox.x + tagsGroupBox.width).toBeLessThanOrEqual(searchBox.x + searchBox.width + 1);
        await expectWithinViewport(tagFilter, width);

        // Sidebar and main column sit side by side without overlapping.
        const headingBox = await heading.boundingBox();
        expect(tagsGroupBox.x + tagsGroupBox.width).toBeLessThanOrEqual(headingBox.x);

        // --- Fixed footer doesn't cover the tag sidebar or the last tile ---
        const footer = page.getByRole('contentinfo');
        const footerBox = await footer.boundingBox();
        expect(tagsGroupBox.y + tagsGroupBox.height).toBeLessThanOrEqual(footerBox.y);

        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const lastTileBox = await page.locator('.cds--tile--clickable').last().boundingBox();
        const footerBoxAtBottom = await footer.boundingBox();
        expect(lastTileBox.y + lastTileBox.height).toBeLessThanOrEqual(footerBoxAtBottom.y);
        await page.evaluate(() => window.scrollTo(0, 0));

        // --- Accessibility scan of the dashboard at md width ---
        // Every scan in this test runs *before* that step's trial clicks: a
        // trial click leaves the mouse hovering the button, and axe would then
        // read Carbon's mid-transition hover colors and report a bogus,
        // run-to-run-varying contrast failure.
        let results = await new AxeBuilder({ page }).analyze();
        expect(results.violations).toEqual([]);

        // --- Header: title and logout action both fit ---
        await expectWithinViewport(page.getByRole('button', { name: 'Log out' }), width);
        await expectClickable(page.getByRole('button', { name: 'Log out' }));

        // --- Record detail modal ---
        // Targeted by Carbon's stable class rather than the tile's title text,
        // since that text is real research content that could change later.
        await page.locator('.cds--tile--clickable').first().click();
        const detailModal = page.getByRole('dialog');
        await expect(detailModal).toBeVisible();
        await expectWithinViewport(detailModal, width);
        await expectNoHorizontalOverflow(page);

        // Accessibility scan of the record detail modal at md width.
        results = await new AxeBuilder({ page }).analyze();
        expect(results.violations).toEqual([]);

        await expectClickable(detailModal.getByRole('button', { name: 'Close' }));

        // The three action buttons live in their own wrapping row underneath
        // the tags, instead of trailing inline off the end of the tag row.
        const edit = detailModal.getByRole('button', { name: 'Edit' });
        const del = detailModal.getByRole('button', { name: 'Delete' });
        const history = detailModal.getByRole('button', { name: 'View history' });
        for (const button of [edit, del, history]) {
            await expectWithinViewport(button, width);
            await expectClickable(button);
        }
        const lastTagBox = await detailModal.locator('.cds--tag').last().boundingBox();
        const editBox = await edit.boundingBox();
        expect(editBox.y).toBeGreaterThanOrEqual(lastTagBox.y + lastTagBox.height);

        // --- Delete confirmation, nested on top of the detail modal ---
        // Opened with focus + Enter, like keyboard-access.spec.js.
        await del.focus();
        await page.keyboard.press('Enter');
        const dialogs = page.getByRole('dialog');
        await expect(dialogs).toHaveCount(2);
        const confirmDialog = dialogs.last();
        await expectWithinViewport(confirmDialog, width);

        // While focused, Carbon fills the detail modal's tertiary Delete button
        // solid red, then fades it back to transparent once the confirm dialog
        // takes focus. Wait for that fade to finish (a retrying assertion, not
        // a sleep) so axe scans the settled colors rather than reporting a
        // bogus, run-to-run-varying mid-transition contrast failure.
        // Targeted by Carbon's stable class, since `del` (scoped via
        // getByRole('dialog')) also matches the confirm dialog's own Delete
        // button once that dialog is open.
        await expect(page.locator('.cds--btn--danger--tertiary')).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');

        results = await new AxeBuilder({ page }).analyze();
        expect(results.violations).toEqual([]);

        await expectClickable(confirmDialog.getByRole('button', { name: 'Delete' }));
        await expectClickable(confirmDialog.getByRole('button', { name: 'Cancel' }));

        // Same focus-race precondition as keyboard-access.spec.js: wait for the
        // confirm dialog's Cancel button to genuinely hold focus before Escape.
        await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
        await page.keyboard.press('Escape');
        await expect(dialogs).toHaveCount(1);

        // --- Edit form: CKEditor toolbar stays inside the modal ---
        await edit.click();
        const editToolbar = page.locator('.ck-toolbar');
        await expect(editToolbar).toBeVisible();
        await expectWithinViewport(editToolbar, width);
        const editToolbarBox = await editToolbar.boundingBox();
        const editModalBox = await detailModal.boundingBox();
        expect(editToolbarBox.x + editToolbarBox.width).toBeLessThanOrEqual(editModalBox.x + editModalBox.width);
        await expectClickable(detailModal.getByRole('button', { name: 'Save changes' }));

        // Closed via the modal's own Close button rather than Escape: with
        // focus inside the CKEditor, Escape is consumed by the editor.
        await detailModal.getByRole('button', { name: 'Close' }).click();
        await expect(detailModal).not.toBeVisible();

        // --- Create session modal: form, CKEditor toolbar, and submit button ---
        await page.getByRole('button', { name: 'New session' }).click();
        const createModal = page.getByRole('dialog');
        await expect(createModal).toBeVisible();
        await expectWithinViewport(createModal, width);
        await expectClickable(createModal.getByRole('button', { name: 'Close' }));

        const createToolbar = page.locator('.ck-toolbar');
        await expect(createToolbar).toBeVisible();
        const createToolbarBox = await createToolbar.boundingBox();
        const createModalBox = await createModal.boundingBox();
        expect(createToolbarBox.x + createToolbarBox.width).toBeLessThanOrEqual(createModalBox.x + createModalBox.width);

        // The form is taller than the viewport, so the submit button is only
        // reachable by scrolling the modal's own content area.
        await expectClickable(createModal.getByRole('button', { name: 'Create session' }));
        await expectNoHorizontalOverflow(page);
    });
}
