import { voiceOverTest as test } from '@guidepup/playwright';
import { expect } from '@playwright/test';
import { saveSpoken, nowSaying, settle, focusOn } from '../support/voiceOverLog.js';

// The New session dialog (RR-55 layer 1 items): the dialog is named, required
// fields are announced as required, and submitting empty says what is wrong.

test('New session opens a named dialog and an empty submit says what is missing', async ({ page, voiceOver }, testInfo) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Priya Patel/ }).click();
    await expect(page.getByRole('heading', { name: 'Research Records', level: 1 })).toBeVisible();
    await voiceOver.navigateToWebContent();

    await focusOn(page, voiceOver, page.getByRole('button', { name: 'New session' }));
    await voiceOver.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await settle(page);
    const onOpen = await nowSaying(voiceOver);
    await saveSpoken(testInfo, 'new-session-on-open', onOpen);
    expect.soft(onOpen.join(' ')).toMatch(/New research session|Title/);

    await focusOn(page, voiceOver, page.getByRole('button', { name: 'Create session' }));
    await voiceOver.press('Enter');
    await settle(page);
    const afterSubmit = await nowSaying(voiceOver);
    await saveSpoken(testInfo, 'new-session-empty-submit', afterSubmit);
    expect.soft(afterSubmit.join(' ')).toMatch(/Title is required|invalid|required/i);

    await voiceOver.press('Escape');
});
