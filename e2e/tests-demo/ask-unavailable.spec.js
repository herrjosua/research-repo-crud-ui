import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// The demo config never sets LLM_PROVIDER, like the public demo and
// production: Ask the Repo has no language model, so the tab must say so up
// front instead of offering a chat that can only fail.
test('Ask the Repo says it isn\'t available without a language model, and passes an accessibility scan', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Priya Patel/ }).click();
    await page.getByRole('link', { name: 'Ask the Repo' }).click();

    // The server reports it up front...
    const config = await page.request.get('/api/ask/config');
    expect(await config.json()).toEqual({ enabled: false, projects: [] });

    // ...so the notice shows before anyone asks, and asking is disabled.
    await expect(page.getByText("Ask the Repo isn't available here.")).toBeVisible();
    await expect(page.getByText(/You can still browse everything under Research Records/)).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Ask a question about the research' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Send' })).toBeDisabled();
    const starters = page.getByText('Try asking').locator('..').getByRole('button');
    await expect(starters.first()).toBeDisabled();

    // POST /api/ask agrees: 503, never a broken chat.
    const ask = await page.request.post('/api/ask', { data: { question: 'anything' } });
    expect(ask.status()).toBe(503);

    // Accessibility scan of the unavailable state, demo banner included.
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
});
