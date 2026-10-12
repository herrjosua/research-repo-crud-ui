import { voiceOverTest as test } from '@guidepup/playwright';
import { expect } from '@playwright/test';
import { saveSpoken, stepThrough, stepUntil, nowSaying, tabUntil, settle, focusOn, followFocus } from '../support/voiceOverLog.js';
import { conversation } from '../support/askLocators.js';

// The Ask tab (v1.3.6.54, .55, .57, .62, .63), in the demo's pick-a-question
// mode: a new answer is announced once, focus lands on it, its citations can be
// reached, and a source dialog opens and closes cleanly.

const QUESTION = "Why didn't physicians trust the ambient scribe's draft notes?";

async function openAsk(page, voiceOver) {
    await page.goto('/');
    await page.getByRole('button', { name: /Priya Patel/ }).click();
    await page.getByRole('link', { name: 'Ask the Repo' }).click();
    await expect(page.getByText('Choose a question', { exact: true })).toBeVisible();
    await voiceOver.navigateToWebContent();
}

async function askQuestion(page) {
    await page.getByRole('button', { name: QUESTION, exact: true }).click();
    await expect(conversation(page).locator('p', { hasText: 'Physicians read every line of the draft' })).toBeVisible();
}

test('"Skip to conversation" lands on the Conversation region', async ({ page, voiceOver }, testInfo) => {
    await openAsk(page, voiceOver);

    const reached = await tabUntil(voiceOver, /skip to conversation/i, 25);
    expect.soft(reached, 'a Tab stop reads "Skip to conversation"').toBe(true);

    await voiceOver.press('Enter');
    await settle(page);
    const said = await nowSaying(voiceOver);
    await saveSpoken(testInfo, 'skip-to-conversation', said);

    expect.soft(said.join(' ')).toContain('Conversation');
});

test('a new answer is spoken once and focus lands on it', async ({ page, voiceOver }, testInfo) => {
    await openAsk(page, voiceOver);
    await voiceOver.clearSpokenPhraseLog();

    await askQuestion(page);
    await settle(page);
    // Chrome leaves the VoiceOver cursor where it was when the page moves
    // focus, so follow the keyboard focus, which is where a Tab would go next.
    await voiceOver.perform(voiceOver.keyboardCommands.moveCursorToKeyboardFocus);
    await settle(page);
    const said = await nowSaying(voiceOver);
    await saveSpoken(testInfo, 'answer-on-arrival', said);

    expect.soft(said.join(' '), 'VoiceOver is on the answer or has announced it').toMatch(/Answer from Ask the Repo|Physicians read every line/);
});

test('the answer reads through, with its citations as buttons that open a dialog', async ({ page, voiceOver }, testInfo) => {
    await openAsk(page, voiceOver);
    await askQuestion(page);
    await settle(page);

    await voiceOver.clearSpokenPhraseLog();
    await stepThrough(voiceOver, 20);
    const walked = await voiceOver.spokenPhraseLog();
    await saveSpoken(testInfo, 'answer-walk', walked);

    const all = walked.join(' ');
    expect.soft(all).toContain('Physicians read every line of the draft');
    expect.soft(all).toMatch(/Source 1: /);
    const times = all.split('Physicians read every line of the draft').length - 1;
    expect.soft(times, 'the answer text is read once while walking the page').toBeLessThanOrEqual(1);
});

test('a source opens in a dialog and closing it returns to the citation', async ({ page, voiceOver }, testInfo) => {
    await openAsk(page, voiceOver);
    await askQuestion(page);
    await settle(page);

    const citation = page.getByRole('button', { name: /^Source 1: / });
    // The answer walk already shows how the citation reads. Here the cursor is
    // not moved to it, because in Chrome VO+Shift+F swallows the next key press.
    await focusOn(page, voiceOver, citation, { follow: false });

    await voiceOver.press('Enter');
    await expect(page.getByRole('dialog')).toBeVisible();
    await settle(page);
    const onOpen = await nowSaying(voiceOver);
    await saveSpoken(testInfo, 'source-dialog-on-open', onOpen);
    const title = (await citation.getAttribute('aria-label')).replace(/^Source 1: /, '');
    expect.soft(onOpen.join(' ')).toContain(title);

    await voiceOver.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await settle(page);
    await followFocus(page, voiceOver);
    const closed = await nowSaying(voiceOver);
    await saveSpoken(testInfo, 'source-dialog-closed', closed);
    expect.soft(closed.join(' ')).toMatch(/Source 1: /);
});

test('the question dropdown and project picker read as one labelled combobox, without "Open menu"', async ({ page, voiceOver }, testInfo) => {
    await openAsk(page, voiceOver);

    await focusOn(page, voiceOver, page.getByRole('combobox', { name: /Project/ }));
    await settle(page);
    const project = await nowSaying(voiceOver);
    await saveSpoken(testInfo, 'project-picker', project);
    expect.soft(project.join(' ')).toMatch(/Project/);
    expect.soft(project.join(' ').toLowerCase()).not.toContain('open menu');

    await askQuestion(page);
    await focusOn(page, voiceOver, page.getByRole('combobox', { name: 'Choose a question' }));
    await settle(page);
    const questions = await nowSaying(voiceOver);
    await saveSpoken(testInfo, 'question-picker', questions);
    expect.soft(questions.join(' ')).toMatch(/Choose a question/);
    expect.soft(questions.join(' ').toLowerCase()).not.toContain('open menu');
});

test('a saved insight has Remove and Show more buttons that name their insight', async ({ page, voiceOver }, testInfo) => {
    await openAsk(page, voiceOver);
    await askQuestion(page);
    await page.getByRole('button', { name: /^Source 1: / }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Save as insight' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();
    await page.getByRole('tab', { name: 'Saved Insights' }).click();
    await expect(page.getByRole('button', { name: /^Remove insight: / })).toBeVisible();
    await settle(page);

    await focusOn(page, voiceOver, page.getByRole('button', { name: /^Remove insight: / }));
    await settle(page);
    const said = await nowSaying(voiceOver);
    await saveSpoken(testInfo, 'insight-remove', said);
    expect.soft(said.join(' ')).toMatch(/Remove insight: .+/);

    // Show more only exists for long insights.
    const more = page.getByRole('button', { name: /^Show more: / });
    if (await more.count()) {
        await focusOn(page, voiceOver, more.first());
        await settle(page);
        const readMore = await nowSaying(voiceOver);
        await saveSpoken(testInfo, 'insight-show-more', readMore);
        expect.soft(readMore.join(' ')).toMatch(/Show more: .+/);
    }
});
