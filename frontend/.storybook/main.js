import { mergeConfig } from 'vite';
import projectViteConfig from '../vite.config.js';

/** @type { import('@storybook/react-vite').StorybookConfig } */
const config = {
  stories: ['../src/**/*.stories.@(js|jsx)'],
  // Controls/Actions/Interactions ship inside the `storybook` core package
  // itself in v10 — no addon install needed for those. Docs (the autodocs
  // page + props table) and a11y (a real axe scan per story) don't, so
  // they're listed explicitly. Pseudo-states forces :hover/:focus/:active
  // per element (Shared/Core/Button) so Chromatic snapshots those states.
  addons: ['@storybook/addon-docs', '@storybook/addon-a11y', 'storybook-addon-pseudo-states'],
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
