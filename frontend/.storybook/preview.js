// Same global stylesheet main.jsx loads for the real app, so Carbon's base
// theme and resets are in place before any story-level SCSS Module applies.
import '../src/index.scss';

/** @type { import('@storybook/react-vite').Preview } */
const preview = {
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
