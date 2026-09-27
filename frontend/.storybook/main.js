import { mergeConfig } from 'vite';
import projectViteConfig from '../vite.config.js';

/** @type { import('@storybook/react-vite').StorybookConfig } */
const config = {
  stories: ['../src/**/*.stories.@(js|jsx)'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  // @storybook/react-vite already provides @vitejs/plugin-react itself, so
  // we don't re-merge `plugins` here (that would register the React plugin
  // twice). What the real app's vite.config.js adds on top — the `~` alias
  // strip Carbon's SCSS needs (see the comment there) and __APP_VERSION__ —
  // has to be merged in explicitly so components resolve the same way here
  // as they do in `vite dev`.
  viteFinal: (config) =>
    mergeConfig(config, {
      resolve: projectViteConfig.resolve,
      define: projectViteConfig.define,
    }),
};

export default config;
