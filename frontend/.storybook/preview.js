// Same global stylesheet main.jsx loads for the real app, so Carbon's base
// theme and resets are in place before any story-level SCSS Module applies.
import '../src/index.scss';

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
};

export default preview;
