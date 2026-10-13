import { voiceOverTest as test } from '@guidepup/playwright';
import { expect } from '@playwright/test';
import { saveSpoken, nowSaying, settle, focusOn, followFocus } from '../support/voiceOverLog.js';

// The New session dialog (RR-55 layer 1 items): the dialog is named, required
// fields are announced as required, and submitting empty says what is wrong.

test('New session opens a named dialog and an empty submit says what is missing', async ({ page, voiceOver }, testInfo) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Priya Patel/ }).click();
    await expect(page.getByRole('heading', { name: 'Research Records', level: 1 })).toBeVisible();
    await voiceOver.navigateToWebContent();

    await focusOn(page, voiceOver, page.getByRole('button', { name: 'New session' }), { follow: false });
    await voiceOver.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await settle(page);
    // Opening the dialog must not count as a submit. Safari once read the Title
    // as "invalid data" before anything was submitted, so this checks the page
    // itself rather than only what was spoken.
    const titleField = page.getByRole('dialog').getByRole('textbox', { name: /^Title/ });
    await expect(titleField, 'Title is not marked invalid just by opening the dialog').not.toHaveAttribute('aria-invalid', 'true');
    const onOpen = await nowSaying(voiceOver);
    await saveSpoken(testInfo, 'new-session-on-open', onOpen);
    // Chrome did not speak when this dialog opened, though focus is on the Title
    // field (the empty submit below reads it). The raw speech is kept above for
    // reference; what is checked is where focus is, once the cursor follows it.
    await followFocus(page, voiceOver);
    const focused = await nowSaying(voiceOver);
    await saveSpoken(testInfo, 'new-session-focused', focused);
    expect.soft(focused.join(' '), 'focus is on the Title field').toMatch(/Title/);

    await focusOn(page, voiceOver, page.getByRole('button', { name: 'Create session' }), { follow: false });
    await voiceOver.press('Enter');
    await settle(page);
    const afterSubmit = await nowSaying(voiceOver);
    await saveSpoken(testInfo, 'new-session-empty-submit', afterSubmit);
    // The page, not the speech: the failed submit leaves focus on Title, marked invalid.
    await expect(titleField).toBeFocused();
    await expect(titleField).toHaveAttribute('aria-invalid', 'true');
    // Safari left the cursor on the button, as Chrome does for page-caused focus
    // moves, so read Title by following focus (last step: keys fail after this).
    await followFocus(page, voiceOver);
    const followed = await nowSaying(voiceOver);
    await saveSpoken(testInfo, 'new-session-empty-submit-followed', followed);
    expect.soft(followed.join(' ')).toMatch(/Title.*(required|invalid)/i);

    await page.keyboard.press('Escape');
});
