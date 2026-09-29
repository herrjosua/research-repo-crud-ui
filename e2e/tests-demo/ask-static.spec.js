import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// The demo config runs LLM_PROVIDER=static, like the public demo: there is
// no model, and visitors pick from captured questions. support/
// start-backend.js serves fixtures/static-answers.json (answers that cite
// fixtures/corpus) and layers fixtures/static-demo/'s project list over the
// corpus, so the project picker has something to filter by.
test('Ask the Repo offers only captured questions, filters them by project, and answers one with working citations', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Priya Patel/ }).click();
    // Under `vite dev` the page probes for the dev-only provider toggle's
    // route; like the public demo, this backend has no dev tools.
    const devProbe = page.waitForResponse((res) => new URL(res.url()).pathname === '/api/dev/provider');
    await page.getByRole('link', { name: 'Ask the Repo' }).click();
    expect((await devProbe).status()).toBe(404);
    await expect(page.getByRole('tablist', { name: 'Ask the Repo provider (dev only)' })).toHaveCount(0);

    // --- The picker replaces the composer ---
    const questionButton = (name) => page.getByRole('button', { name, exact: true });
    await expect(page.getByText('Choose a question', { exact: true })).toBeVisible();
    for (const question of [
        "Why didn't physicians trust the ambient scribe's draft notes?",
        'How do nurses feel about AI-generated documentation?',
        'How much drafting time did the AI save on prior auth cases?',
        'What went wrong in the prior auth drafts?',
    ]) {
        await expect(questionButton(question)).toBeVisible();
    }
    // The pre-generated banner, built from the capture's model and date.
    const banner = page.locator('.cds--actionable-notification', { hasText: 'Answers are pre-generated' });
    await expect(banner).toBeVisible();
    await expect(banner).toContainText(
        'Captured from a local model run (gemma2:9b, Sep 28, 2026) on sample data. To ask your own questions, run the project locally',
    );
    const readmeLink = banner.getByRole('link', { name: 'run the project locally (opens in a new tab)', exact: true });
    await expect(readmeLink).toHaveAttribute('href', 'https://github.com/herrjosua/research-repo-crud-ui#getting-started');
    await expect(readmeLink).toHaveAttribute('target', '_blank');
    await expect(readmeLink).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(page.getByRole('textbox', { name: 'Ask a question about the research' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Send' })).toHaveCount(0);

    // The server takes ids only: free text is refused.
    const typed = await page.request.post('/api/ask', { data: { question: 'anything' } });
    expect(typed.status()).toBe(400);

    // Accessibility scan of the static empty state, demo banner included.
    let results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);

    // --- The project picker filters the list ---
    const projects = page.getByRole('combobox', { name: /Project/ });
    async function pickProject(name) {
        await projects.click();
        await page.getByRole('option', { name }).click();
    }
    await pickProject(/AI-Assisted Prior Authorization/);
    await expect(questionButton('How much drafting time did the AI save on prior auth cases?')).toBeVisible();
    await expect(questionButton('What went wrong in the prior auth drafts?')).toBeVisible();
    await expect(questionButton("Why didn't physicians trust the ambient scribe's draft notes?")).toHaveCount(0);

    // A project with no captured questions isn't offered at all.
    await projects.click();
    await expect(page.getByRole('option', { name: /Onboarding/ })).toHaveCount(0);
    await page.getByRole('option', { name: /All projects/ }).click();
    await expect(questionButton("Why didn't physicians trust the ambient scribe's draft notes?")).toBeVisible();

    // --- Pick a question: it's asked by id and answered at once ---
    const question = "Why didn't physicians trust the ambient scribe's draft notes?";
    const askRequest = page.waitForRequest((req) => req.url().endsWith('/api/ask') && req.method() === 'POST');
    await questionButton(question).click();
    expect((await askRequest).postDataJSON()).toEqual({ questionId: 'all-scribe-draft-trust' });

    await expect(page.locator('p', { hasText: 'Physicians read every line of the draft before accepting it' })).toBeVisible();
    const citation = page.getByRole('button', { name: /^Source 1: / });
    await expect(citation).toBeVisible();
    await expect(page.getByRole('button', { name: /^Source 2: / })).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Sources' }).getByRole('article')).toHaveCount(2);
    await expect(page.getByText(/can take up to 20 seconds/)).toHaveCount(0);

    // The dropdown now sits where the composer was, and the banner stays.
    const questionDropdown = page.getByRole('combobox', { name: 'Choose a question' });
    await expect(questionDropdown).toBeVisible();
    await expect(banner).toBeInViewport({ ratio: 1 });

    // Accessibility scan of the answered state, with the dropdown.
    results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);

    // --- [1] opens its source in the detail modal ---
    const title = (await citation.getAttribute('aria-label')).replace(/^Source 1: /, '');
    await citation.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', { name: title })).toBeVisible();
    await expect(page.locator('.cds--modal.is-visible')).toHaveCSS('opacity', '1');
    // The cited record's project, from the demo's project list.
    await expect(dialog.getByText('Ambient AI Scribe', { exact: true })).toBeVisible();

    results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);

    // --- Save as insight ---
    await dialog.getByRole('button', { name: 'Save as insight' }).click();
    await expect(dialog.getByRole('button', { name: 'Saved as insight' })).toHaveAttribute('aria-pressed', 'true');
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(dialog).not.toBeVisible();

    // --- A second question from the dropdown, in the same conversation ---
    await questionDropdown.click();
    await page.getByRole('option', { name: 'How do nurses feel about AI-generated documentation?' }).click();
    await expect(page.locator('p', { hasText: 'Most respondents were neutral to skeptical' })).toBeVisible();
    await expect(questionDropdown).toContainText('Choose a question');

    // --- The insight is in the Saved Insights tab, under its project ---
    await page.getByRole('tab', { name: 'Saved Insights' }).click();
    await expect(page.getByRole('region', { name: 'Ambient AI Scribe' }).getByRole('heading', { name: title })).toBeVisible();
});

// 672px is Carbon's md floor (see tests/responsive.spec.js). The chat column
// is narrowest there, and Carbon's list box draws each option as one
// fixed-height, ellipsized line, so most questions would be cut off. The
// picker's override (chat/QuestionPicker.module.scss) lets options wrap;
// this checks the rendered result, not the CSS.
test('at 672px the question dropdown wraps long questions instead of clipping them', async ({ page }) => {
    const questions = [
        "Why didn't physicians trust the ambient scribe's draft notes?",
        'How do nurses feel about AI-generated documentation?',
        'How much drafting time did the AI save on prior auth cases?',
        'What went wrong in the prior auth drafts?',
    ];
    const longest = questions.reduce((a, b) => (b.length > a.length ? b : a));

    // The header's primary nav collapses below lg, so reach Ask the Repo
    // first, then narrow the window.
    await page.goto('/');
    await page.getByRole('button', { name: /Priya Patel/ }).click();
    await page.getByRole('link', { name: 'Ask the Repo' }).click();
    await page.setViewportSize({ width: 672, height: 800 });

    // Wait for static mode before clicking a question. Until /api/ask/config
    // answers, Ask renders its live-mode starters, and the first of those has
    // exactly questions[0]'s text — clicking it only fills the composer, so
    // nothing is asked and the dropdown below never appears (v1.3.6.7:
    // reproduced every time by delaying the config response 1.5s). The static
    // list's own label only renders once the config says `mode: 'static'`.
    await expect(page.getByText('Choose a question', { exact: true })).toBeVisible();

    const firstQuestion = page.getByRole('button', { name: questions[0], exact: true });
    await firstQuestion.click();
    // The click's own result, not just the next step's: picking a question
    // starts the conversation, which replaces the empty-state list. If this
    // times out, the click didn't ask anything.
    await expect(firstQuestion).toHaveCount(0);

    const dropdown = page.getByRole('combobox', { name: 'Choose a question' });
    await dropdown.click();
    const options = page.getByRole('option');
    await expect(options).toHaveCount(questions.length);

    for (const [i, question] of questions.entries()) {
        const option = options.nth(i);
        await option.scrollIntoViewIfNeeded();
        await expect(option).toHaveText(question);
        // The element holding the text (Carbon's, inside role=option) must
        // show all of it: nothing overflowing its box horizontally, which is
        // what an ellipsis or a clip would mean.
        const text = option.locator('.cds--list-box__menu-item__option');
        const { scrollWidth, clientWidth, height, lineHeight } = await text.evaluate((el) => ({
            scrollWidth: el.scrollWidth,
            clientWidth: el.clientWidth,
            height: el.getBoundingClientRect().height,
            lineHeight: parseFloat(getComputedStyle(el).lineHeight),
        }));
        expect(scrollWidth, `"${question}" is clipped`).toBeLessThanOrEqual(clientWidth);
        // And the longest question really wraps onto more than one line.
        if (question === longest) {
            expect(height, `"${question}" doesn't wrap`).toBeGreaterThan(lineHeight * 1.5);
        }
    }

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth);

    // A wrapped option is still picked like any other.
    await options.nth(questions.indexOf('How much drafting time did the AI save on prior auth cases?')).click();
    await expect(page.locator('p', { hasText: 'drafting time from about 15 minutes to about 5' })).toBeVisible();
});

// The pre-generated banner is the chat panel's first row, outside the
// scrolling thread: at 1280px and at the 672px md floor (see
// tests/responsive.spec.js) it must be wholly on screen without scrolling,
// before a question is picked and after one is answered, and not push the
// page into horizontal scroll.
for (const width of [1280, 672]) {
    test(`at ${width}px the pre-generated banner is in view before and after a question`, async ({ page }) => {
        async function expectNoHorizontalOverflow() {
            const { scrollWidth, clientWidth } = await page.evaluate(() => ({
                scrollWidth: document.documentElement.scrollWidth,
                clientWidth: document.documentElement.clientWidth,
            }));
            expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
        }

        // The header's primary nav collapses below lg, so reach Ask the
        // Repo first, then set the window size.
        await page.goto('/');
        await page.getByRole('button', { name: /Priya Patel/ }).click();
        await page.getByRole('link', { name: 'Ask the Repo' }).click();
        await page.setViewportSize({ width, height: 800 });

        const banner = page.locator('.cds--actionable-notification', { hasText: 'Answers are pre-generated' });
        await expect(page.getByText('Choose a question', { exact: true })).toBeVisible();
        await expect(banner).toBeInViewport({ ratio: 1 });
        await expectNoHorizontalOverflow();

        const question = page.getByRole('button', { name: "Why didn't physicians trust the ambient scribe's draft notes?", exact: true });
        await question.click();
        await expect(page.locator('p', { hasText: 'Physicians read every line of the draft before accepting it' })).toBeVisible();
        await expect(banner).toBeInViewport({ ratio: 1 });
        await expectNoHorizontalOverflow();
    });
}
