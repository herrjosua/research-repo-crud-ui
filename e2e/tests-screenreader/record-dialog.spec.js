import { voiceOverTest as test } from '@guidepup/playwright';
import { expect } from '@playwright/test';
import { saveSpoken, stepThrough, nowSaying, settle, focusOn, followFocus } from '../support/voiceOverLog.js';

// The record card and the record dialog (v1.3.6.56, .59, .60, .61, .64).

async function openDashboard(page, voiceOver) {
    await page.goto('/');
    await page.getByRole('button', { name: /Priya Patel/ }).click();
    await expect(page.getByRole('heading', { name: 'Research Records', level: 1 })).toBeVisible();
    await voiceOver.navigateToWebContent();
}

const firstCard = (page) => page.locator('main ul li [role="button"]').first();

test('a record card is read as a button that opens a dialog, named by its title first', async ({ page, voiceOver }, testInfo) => {
    await openDashboard(page, voiceOver);

    await focusOn(page, voiceOver, firstCard(page));
    await settle(page);
    const said = await nowSaying(voiceOver);
    await saveSpoken(testInfo, 'card-focus', said);

    expect.soft(said.join(' ').toLowerCase()).toContain('button');
    expect.soft(said.join(' ').toLowerCase()).toMatch(/dialog|popup|pop-up/);
});

test('opening a record: what is said on open, and the dialog read through', async ({ page, voiceOver }, testInfo) => {
    await openDashboard(page, voiceOver);
    const title = await firstCard(page).locator('h2').innerText();

    await focusOn(page, voiceOver, firstCard(page), { follow: false });
    await voiceOver.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await settle(page);
    // What was said on open, before the cursor is moved: VO+Shift+F speaks the
    // focused item and replaces it.
    const onOpen = await nowSaying(voiceOver);
    await saveSpoken(testInfo, 'dialog-on-open', onOpen);
    await followFocus(page, voiceOver);
    expect.soft(onOpen.join(' '), 'on open VoiceOver is on or announces the record title').toContain(title);
    // Focus moves to the title, but the VoiceOver cursor can still be on Close, which
    // Carbon focuses first, so the cursor is not checked. What matters is what is said.
    expect.soft(onOpen.join(' ').toLowerCase(), 'the title is not read as an empty group').not.toContain('empty group');

    await voiceOver.clearSpokenPhraseLog();
    await stepThrough(voiceOver, 25);
    const walked = await voiceOver.spokenPhraseLog();
    await saveSpoken(testInfo, 'dialog-walk', walked);

    const all = walked.join(' ');
    expect.soft(all).toMatch(/Edit record: /);
    expect.soft(all).toMatch(/Delete record: /);
    expect.soft(all).toMatch(/View history of /);
    expect.soft(all.toLowerCase()).not.toContain('sentinel');
    const body = (await page.getByRole('dialog').locator('[class*="body"]').first().innerText()).trim();
    expect.soft(all, 'the record body is reached').toContain(body.split(/\s+/).slice(0, 4).join(' '));
});

test('closing the dialog returns VoiceOver to the card that opened it', async ({ page, voiceOver }, testInfo) => {
    await openDashboard(page, voiceOver);
    const title = await firstCard(page).locator('h2').innerText();

    await focusOn(page, voiceOver, firstCard(page), { follow: false });
    await voiceOver.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await settle(page);
    await voiceOver.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await settle(page);
    await followFocus(page, voiceOver);

    const said = await nowSaying(voiceOver);
    await saveSpoken(testInfo, 'dialog-closed', said);
    expect.soft(said.join(' ')).toContain(title);
});

test('the delete confirmation announces itself as a dialog with its question', async ({ page, voiceOver }, testInfo) => {
    await openDashboard(page, voiceOver);

    await focusOn(page, voiceOver, firstCard(page), { follow: false });
    await voiceOver.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await settle(page);
    const deleteButton = page.getByRole('button', { name: /^Delete record:/ });
    test.skip((await deleteButton.count()) === 0, 'the first record is read-only, so it has no Delete');
    await focusOn(page, voiceOver, deleteButton, { follow: false });
    await voiceOver.press('Enter');
    await expect(page.getByRole('dialog').last()).toContainText('Delete this record?');
    await settle(page);

    const said = await nowSaying(voiceOver);
    await saveSpoken(testInfo, 'delete-confirm', said);
    expect.soft(said.join(' ')).toContain('Delete this record?');

    await voiceOver.press('Escape');
});
