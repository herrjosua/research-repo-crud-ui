import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import { announcement, conversation } from '../support/askLocators.js';

// The real backend and retrieval over the fixture corpus, answered by the
// fake Ollama support/start-backend.js starts (its fixed reply cites [1] and
// [2]). The fixture corpus has no project list, so the picker shows only
// "All projects" and saved insights land in "Other".
test('asks a question, opens a cited source from the answer, and saves it as an insight', async ({ page, request }) => {
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
    await page.getByRole('link', { name: 'Ask the Repo' }).click();

    // --- Config: asking is on, and there's no project list in this corpus ---
    const projects = page.getByRole('combobox', { name: /Project/ });
    await expect(projects).toContainText('All projects');
    await projects.click();
    await expect(page.getByRole('option')).toHaveCount(1);
    await expect(page.getByRole('option', { name: 'All projects' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText('Questions you ask will appear here.')).toBeVisible();
    await expect(page.getByText("Ask the Repo isn't available here.")).toHaveCount(0);

    // --- Ask ---
    const question = 'Did physicians trust the ambient scribe draft?';
    await page.getByRole('textbox', { name: 'Ask a question about the research' }).fill(question);
    await page.getByRole('button', { name: 'Send' }).click();

    // --- The answer renders, with its citations, sources and conversation ---
    // A paragraph in the thread, not the rail's preview of the same first line.
    await expect(conversation(page).locator('p', { hasText: 'Physicians did not trust the draft enough to skim it' })).toBeVisible();
    // A screen reader hears the answer, the source count and the next steps.
    await expect(announcement(page)).toContainText('Answer received. Physicians did not trust the draft enough to skim it');
    await expect(announcement(page)).toContainText('Tab to a citation to open its source');
    const citation = page.getByRole('button', { name: /^Source 1: / });
    await expect(citation).toBeVisible();
    await expect(page.getByRole('button', { name: /^Source 2: / })).toBeVisible();
    const sourcesRail = page.getByRole('complementary', { name: 'Sources' });
    await expect(sourcesRail.getByRole('article')).toHaveCount(2);
    await expect(page.getByRole('button', { name: new RegExp(`^${question.replace('?', '\\?')}`) })).toHaveAttribute('aria-current', 'true');

    // Accessibility scan of the answered state (answer, citations, sources
    // rail, and the conversation in the left rail).
    let results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);

    // --- [1] opens its source in the detail modal ---
    const title = (await citation.getAttribute('aria-label')).replace(/^Source 1: /, '');
    await citation.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: title })).toBeVisible();
    // Carbon fades the modal in; scan the settled colors, not mid-transition.
    await expect(page.locator('.cds--modal.is-visible')).toHaveCSS('opacity', '1');

    results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);

    // --- Save as insight ---
    await dialog.getByRole('button', { name: 'Save as insight' }).click();
    await expect(dialog.getByRole('button', { name: 'Saved as insight' })).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).not.toBeVisible();

    // --- It's in the Saved Insights tab (no project list, so under "Other") ---
    await page.getByRole('tab', { name: 'Saved Insights' }).click();
    const other = page.getByRole('region', { name: 'Other' });
    await expect(other.getByRole('heading', { name: title })).toBeVisible();
});
