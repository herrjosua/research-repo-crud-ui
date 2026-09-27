import { useState } from 'react';
import SourceDetailModal from './SourceDetailModal';
import { INITIAL_MESSAGES_BY_CONVERSATION } from '../mock/messages';

const SOURCES = INITIAL_MESSAGES_BY_CONVERSATION.c1[1].sources;
const SOURCES_BY_LABEL = Object.fromEntries(SOURCES.map((source) => [`${source.kind} — ${source.title}`, source]));

// Grouped under Ask the Repo, next to the rest of the sources rail. No
// PropTypes/TS, so `argTypes` is explicit (same reasoning as
// KindTag.stories.jsx); `source` is a `select` over the real mock sources
// (one per kind except `doc`), mapped to the real objects.
//
// `docs.story.inline: false`: Carbon's Modal is `position: fixed` over the
// whole viewport, so rendered inline on the autodocs page every story's
// modal would stack over the page itself. An iframe per story keeps each
// one contained to its own preview box.
export default {
  title: 'Ask the Repo/SourceDetailModal',
  component: SourceDetailModal,
  argTypes: {
    source: {
      control: 'select',
      options: Object.keys(SOURCES_BY_LABEL),
      mapping: SOURCES_BY_LABEL,
    },
    open: { control: 'boolean' },
    pinned: { control: 'boolean' },
    saved: { control: 'boolean' },
  },
  parameters: {
    layout: 'fullscreen',
    docs: { story: { inline: false, iframeHeight: 720 } },
  },
};

// Live-editable playground. `pinned`/`saved` are wired through local
// state so the buttons visibly toggle in the canvas; closing the modal
// (× / Esc / click outside) shows a button to reopen it.
function InteractiveModal(args) {
  const [open, setOpen] = useState(args.open);
  const [pinned, setPinned] = useState(args.pinned);
  const [saved, setSaved] = useState(args.saved);
  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)}>
          Reopen modal
        </button>
      )}
      <SourceDetailModal
        {...args}
        open={open}
        onClose={() => setOpen(false)}
        pinned={pinned}
        onTogglePin={() => setPinned((v) => !v)}
        saved={saved}
        onToggleSave={() => setSaved((v) => !v)}
      />
    </>
  );
}

export const Default = {
  args: {
    source: Object.keys(SOURCES_BY_LABEL)[0],
    open: true,
    pinned: false,
    saved: false,
  },
  render: (args) => <InteractiveModal {...args} />,
};

// Pinned + saved on the transcript source: both toggles' "on" state, and
// the one KindTag kind with a custom (orange) override, on the modal's
// own layer — the background this ticket adds for KindTag.
export const PinnedAndSavedTranscript = {
  args: {
    source: Object.keys(SOURCES_BY_LABEL)[2],
    open: true,
    pinned: true,
    saved: true,
  },
  render: (args) => <InteractiveModal {...args} />,
};

// A synthesis source: not primary evidence, so no pin action — only
// "Save as insight".
export const NotPinnable = {
  args: {
    source: Object.keys(SOURCES_BY_LABEL)[3],
    open: true,
    pinned: false,
    saved: false,
  },
  render: (args) => <InteractiveModal {...args} />,
};
