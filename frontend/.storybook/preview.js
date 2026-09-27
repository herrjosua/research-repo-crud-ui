import { useEffect } from 'react';

// Same global stylesheet main.jsx loads for the real app, so Carbon's base
// theme and resets are in place before any story-level SCSS Module applies.
import '../src/index.scss';

// Mirrors ../src/useTheme.js's DARK_THEME_CLASS exactly (see that file and
// ask-the-repo/TOKEN_MAPPING.md's "Dark/light mode" section): Carbon's
// `.cds--g100` class block already ships in the compiled CSS pulled in via
// index.scss above, so toggling this one class on <body> is the real app's
// entire re-theming mechanism — no Storybook-only approximation needed.
const DARK_THEME_CLASS = 'cds--g100';

// useTheme.js drives this same class toggle from React state (its own
// useState + localStorage); here the toolbar's `theme` global is the
// equivalent state, and Storybook already persists globals across reloads
// on its own, so there's no need to duplicate useTheme's localStorage logic.
const WithTheme = (Story, context) => {
  const isDark = context.globals.theme === 'g100';

  useEffect(() => {
    document.body.classList.toggle(DARK_THEME_CLASS, isDark);
  }, [isDark]);

  return Story();
};

/** @type { import('@storybook/react-vite').Preview } */
const preview = {
  // Every story gets an autodocs page by default (opt out per-story with
  // tags: ['!autodocs']) — this track exists for the documentation/style
  // guide value, so that should be the default, not something each future
  // story has to remember to turn on.
  tags: ['autodocs'],
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  initialGlobals: {
    theme: 'white',
  },
  globalTypes: {
    theme: {
      description: 'App theme — toggles the same cds--g100 body class useTheme.js does',
      toolbar: {
        title: 'Theme',
        icon: 'contrast',
        items: [
          { value: 'white', title: 'White' },
          { value: 'g100', title: 'G100 (dark)' },
        ],
        dynamicTitle: true,
      },
    },
  },
  decorators: [WithTheme],
};

export default preview;
