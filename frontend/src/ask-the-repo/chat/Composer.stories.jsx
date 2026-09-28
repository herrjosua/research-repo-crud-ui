import { useState } from 'react';
import Composer from './Composer';

// Grouped under Ask the Repo, alongside the rest of the chat panel. No
// PropTypes/TS on Composer, so `argTypes` is given explicitly (same
// reasoning as sources/KindTag.stories.jsx).
export default {
  title: 'Ask the Repo/Composer',
  component: Composer,
  argTypes: {
    value: { control: 'text' },
    sending: { control: 'boolean' },
    disabled: { control: 'boolean' },
  },
};

// Composer is a controlled input (`value`/`onChange`), so this story wraps
// it in its own `useState` rather than a plain `args` object — otherwise
// typing into Controls' text field wouldn't be reflected back into the
// rendered textarea on every keystroke the way a real caller (ChatPanel)
// does. `sending` still comes straight from Controls, since flipping it
// doesn't need local state.
function ControlledComposer(args) {
  const [value, setValue] = useState(args.value);
  return <Composer {...args} value={value} onChange={setValue} onSend={() => setValue('')} />;
}

export const Default = {
  args: {
    value: '',
    sending: false,
  },
  render: (args) => <ControlledComposer {...args} />,
};
