import { useCallback, useEffect, useState } from 'react';

// See ask-the-repo/TOKEN_MAPPING.md ("Dark/light mode"): Carbon's `.cds--g100`
// class block already ships in the compiled CSS, so applying it to <body>
// re-themes every `theme.$x`-based color in the app — no per-component work.
const STORAGE_KEY = 'theme-preference';
const DARK_THEME_CLASS = 'cds--g100';

function prefersDark() {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

function getInitialIsDark() {
    // localStorage throws in some private-browsing modes — fall back to the
    // OS preference rather than crashing the app on first paint.
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored === 'dark') return true;
        if (stored === 'light') return false;
    } catch {
        // ignore — treated the same as "nothing stored" below
    }
    return prefersDark();
}

export default function useTheme() {
    const [isDark, setIsDark] = useState(getInitialIsDark);

    useEffect(() => {
        document.body.classList.toggle(DARK_THEME_CLASS, isDark);
    }, [isDark]);

    const toggle = useCallback(() => {
        setIsDark((wasDark) => {
            const next = !wasDark;
            try {
                localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
            } catch {
                // best-effort persistence only — the toggle still works this session
            }
            return next;
        });
    }, []);

    return { isDark, toggle };
}
