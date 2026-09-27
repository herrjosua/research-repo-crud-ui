import DemoDisclaimer from './DemoDisclaimer';

// Grouped under Shared/Core: genuinely reused across two entry points
// (App.jsx's standalone login screen and DemoUserPicker.jsx's account
// picker), unlike the app's other top-level .jsx files, which are each
// mounted by exactly one parent. The component has no PropTypes/TS, so
// there's no docgen source for argTypes — `args`/`argTypes` are given
// explicitly so Controls has a real field to render.
export default {
  title: 'Shared/Core/DemoDisclaimer',
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
