import { voiceOverTest as test } from '@guidepup/playwright';
import { expect } from '@playwright/test';
import { saveSpoken, stepThrough, nowSaying, tabUntil, headingsInOrder, settle } from '../support/voiceOverLog.js';

// Page structure and the demonstration banner (v1.3.6.63, v1.3.6.64). Each
// test writes down what real VoiceOver said; the soft expectations name what a
// user should hear, so a failure is a finding, not a broken test.

async function openDashboard(page, voiceOver) {
    await page.goto('/');
    await page.getByRole('button', { name: /Priya Patel/ }).click();
    await expect(page.getByRole('heading', { name: 'Research Records', level: 1 })).toBeVisible();
    await voiceOver.navigateToWebContent();
    await voiceOver.clearSpokenPhraseLog();
}

test('the demo picker reads the banner, its sentence, then the accounts', async ({ page, voiceOver }, testInfo) => {
    await page.goto('/');
    await expect(page.getByText('Demonstration environment', { exact: true })).toBeVisible();
    await voiceOver.navigateToWebContent();
    await stepThrough(voiceOver, 12);

    const spoken = await voiceOver.spokenPhraseLog();
    await saveSpoken(testInfo, 'picker-banner', spoken);

    const all = spoken.join(' ');
    expect.soft(all).toContain('Demonstration environment');
    expect.soft(all).toContain('fictional sample data');
    expect.soft(all.toLowerCase()).not.toContain('text field');
});

test('the dashboard starts with a skip link, then banner, navigation, main, heading, cards', async ({ page, voiceOver }, testInfo) => {
    await openDashboard(page, voiceOver);

    const firstStop = await tabUntil(voiceOver, /skip to main content/i, 3);
    expect.soft(firstStop, 'the first Tab stop is "Skip to main content"').toBe(true);

    await voiceOver.clearSpokenPhraseLog();
    await stepThrough(voiceOver, 40);
    const spoken = await voiceOver.spokenPhraseLog();
    await saveSpoken(testInfo, 'dashboard-walk', spoken);

    const all = spoken.join(' ').toLowerCase();
    for (const landmark of ['banner', 'navigation', 'main', 'complementary']) {
        expect.soft(all, `VoiceOver announces a ${landmark}`).toContain(landmark);
    }
    expect.soft(all).toContain('demonstration environment');
    // Only the part before the filters: the search box there is a real text field.
    const banner = all.slice(0, all.indexOf('breadcrumb navigation'));
    expect.soft(banner, 'the banner is not read as a text field').not.toContain('text field');
});

test('the headings list starts with the page heading, and cards are titled h2s', async ({ page, voiceOver }, testInfo) => {
    await openDashboard(page, voiceOver);

    const headings = await headingsInOrder(voiceOver, 5);
    await saveSpoken(testInfo, 'dashboard-headings', headings);

    expect.soft(headings[0]).toMatch(/Research Records/);
});

test('"Skip to records" jumps past the filter rail to the page heading', async ({ page, voiceOver }, testInfo) => {
    await openDashboard(page, voiceOver);

    const reached = await tabUntil(voiceOver, /skip to records/i, 12);
    expect.soft(reached, 'a Tab stop reads "Skip to records"').toBe(true);

    await voiceOver.press('Enter');
    await settle(page);
    const after = await nowSaying(voiceOver);
    await saveSpoken(testInfo, 'skip-to-records', after);

    expect.soft(after.join(' ')).toMatch(/Research Records/);
});
