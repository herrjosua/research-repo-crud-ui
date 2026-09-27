import DemoDisclaimer from './DemoDisclaimer';

// Placeholder story: exercises a Carbon component (Callout) plus this
// component's own SCSS Module (DemoDisclaimer.module.scss), which is enough
// to confirm both resolve correctly inside Storybook's own dev server. The
// component has no PropTypes/TS, so there's no docgen source for argTypes —
// `args` is given explicitly so Controls has a real field to render.
export default {
  title: 'DemoDisclaimer',
  component: DemoDisclaimer,
  argTypes: {
    className: { control: 'text' },
  },
};

export const Default = {
  args: {
    className: '',
  },
};
