import { defineConfig, devices } from '@playwright/test';
import { screenReaderConfig } from '@guidepup/playwright';
import demoConfig from './playwright.demo.config.js';

// Real VoiceOver, driven by Guidepup (RR-55, layer 2). macOS only, run by
// hand: `npm run test:screenreader`. Not part of CI, and not picked up by
// `npm test` or `npm run test:demo` (their testDirs are tests/ and
// tests-demo/). One-time setup on the Mac: `npx @guidepup/setup`.
//
// Uses the demo setup (fixtures, static answers, the demonstration banner),
// so it needs no agentic-repo checkout. Safari's engine (WebKit) in a visible
// window: a screen reader can't drive a headless browser.
export default defineConfig({
    ...screenReaderConfig,
    testDir: './tests-screenreader',
    reportSlowTests: null,
    timeout: 5 * 60 * 1000,
    workers: 1,
    retries: 0,
    use: {
        baseURL: 'http://localhost:5173',
        headless: false,
    },
    projects: [
        {
            name: 'webkit',
            use: { ...devices['Desktop Safari'], headless: false },
        },
    ],
    webServer: demoConfig.webServer,
});
