import { voiceOverTest as test } from '@guidepup/playwright';
import { expect } from '@playwright/test';
import { saveSpoken, stepThrough } from '../support/voiceOverLog.js';

// A recorder first, a test second (v1.3.6.64). Two things were reported with
// real VoiceOver that the Virtual Screen Reader does not show: the
// demonstration banner is read as a text field and its sentence is not
// reached, and a record's contents are not read when its dialog opens. These
// run the same steps with VoiceOver on and write down what it says, so the
// fix follows what was spoken. The soft expectations name what a user
// should hear; a failure here is the finding, not a broken test.

test('the demonstration banner on the demo picker', async ({ page, voiceOver }, testInfo) => {
    await page.goto('/');
    await expect(page.getByText('Demonstration environment', { exact: true })).toBeVisible();

    await voiceOver.navigateToWebContent();
    await stepThrough(voiceOver, 12);

    const spoken = await voiceOver.spokenPhraseLog();
    await saveSpoken(testInfo, 'demo-banner', spoken);

    expect.soft(spoken.join(' ')).toContain('Demonstration environment');
    expect.soft(spoken.join(' ')).toContain('fictional sample data');
    expect.soft(spoken.join(' ').toLowerCase()).not.toContain('text field');
});

test('opening a record from the dashboard', async ({ page, voiceOver }, testInfo) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Priya Patel/ }).click();
    await expect(page.getByRole('heading', { name: 'Research Records', level: 1 })).toBeVisible();

    await voiceOver.navigateToWebContent();
    await voiceOver.clearSpokenPhraseLog();

    // What is spoken when the dialog opens, before the user moves.
    await page.locator('main ul li [role="button"]').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.waitForTimeout(2000);
    const onOpen = await voiceOver.spokenPhraseLog();
    await saveSpoken(testInfo, 'record-on-open', onOpen);

    // Then what the user hears moving through it with the VoiceOver cursor.
    await voiceOver.clearSpokenPhraseLog();
    await stepThrough(voiceOver, 25);
    const walked = await voiceOver.spokenPhraseLog();
    await saveSpoken(testInfo, 'record-walk', walked);

    const body = (await dialog.locator('[class*="body"]').first().innerText()).trim();
    const firstWords = body.split(/\s+/).slice(0, 4).join(' ');
    expect.soft(`${onOpen.join(' ')} ${walked.join(' ')}`).toContain(firstWords);
});
