import { renderHook, act } from '@testing-library/react';
import useTheme from './useTheme';

const STORAGE_KEY = 'theme-preference';
const DARK_CLASS = 'cds--g100';

function mockPrefersDark(matches) {
    window.matchMedia = vi.fn().mockReturnValue({ matches });
}

beforeEach(() => {
    localStorage.clear();
    document.body.classList.remove(DARK_CLASS);
    mockPrefersDark(false);
});

describe('useTheme', () => {
    it('defaults to light when nothing is stored and the OS prefers light', () => {
        const { result } = renderHook(() => useTheme());

        expect(result.current.isDark).toBe(false);
        expect(document.body.classList.contains(DARK_CLASS)).toBe(false);
    });

    it('falls back to the OS preference on first visit, before anything is stored', () => {
        mockPrefersDark(true);

        const { result } = renderHook(() => useTheme());

        expect(result.current.isDark).toBe(true);
        expect(document.body.classList.contains(DARK_CLASS)).toBe(true);
    });

    it('a stored preference overrides the OS preference', () => {
        mockPrefersDark(true);
        localStorage.setItem(STORAGE_KEY, 'light');

        const { result } = renderHook(() => useTheme());

        expect(result.current.isDark).toBe(false);
    });

    it('toggle flips the theme, updates the body class, and persists the choice', () => {
        const { result } = renderHook(() => useTheme());

        act(() => result.current.toggle());

        expect(result.current.isDark).toBe(true);
        expect(document.body.classList.contains(DARK_CLASS)).toBe(true);
        expect(localStorage.getItem(STORAGE_KEY)).toBe('dark');

        act(() => result.current.toggle());

        expect(result.current.isDark).toBe(false);
        expect(document.body.classList.contains(DARK_CLASS)).toBe(false);
        expect(localStorage.getItem(STORAGE_KEY)).toBe('light');
    });

    it('a later mount reads back the persisted choice', () => {
        const first = renderHook(() => useTheme());
        act(() => first.result.current.toggle());

        const second = renderHook(() => useTheme());

        expect(second.result.current.isDark).toBe(true);
    });
});
