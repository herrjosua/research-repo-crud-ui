import { useState } from 'react';
import RecordsRail from './RecordsRail';
import { RECORD_KIND_IDS } from './recordKinds';
import styles from './RecordsRail.stories.module.scss';

// Grouped under Records with EditRecordForm. The rail is presentational
// (Dashboard.jsx owns the filter state), so each story wires it to local
// state seeded from `args` — the checkboxes, searches and sections all work
// in the canvas. Rendered in its real frames, measured in the running app:
// 288px wide at 1280 (the same as Ask the Repo's LeftRail) and 136px at the
// 672px md floor, where "New session" drops its icon to stay on one line.
const TAGS = [
  'accessibility', 'ai-strategy', 'ambient-scribe', 'audit-trail', 'baseline',
  'care-coordination', 'chart-review', 'de-identification', 'documentation',
  'governance', 'usability', 'workflow',
];

function StatefulRail({ initialKinds, initialTags, frame }) {
  const [activeKinds, setActiveKinds] = useState(() => new Set(initialKinds));
  const [activeTags, setActiveTags] = useState(() => new Set(initialTags));
  const [searchQuery, setSearchQuery] = useState('');
  const [tagQuery, setTagQuery] = useState('');
  const toggle = (setter) => (id) => setter((prev) => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const query = tagQuery.trim().toLowerCase();

  return (
    <div className={`${styles.rail} ${frame === 'narrow' ? styles.narrow : ''}`}>
      <RecordsRail
        onNewSession={() => {}}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        activeKinds={activeKinds}
        onToggleKind={toggle(setActiveKinds)}
        tags={query ? TAGS.filter((tag) => tag.includes(query)) : TAGS}
        activeTags={activeTags}
        onToggleTag={toggle(setActiveTags)}
        tagQuery={tagQuery}
        onTagQueryChange={setTagQuery}
      />
    </div>
  );
}

export default {
  title: 'Records/RecordsRail',
  component: RecordsRail,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    initialKinds: { control: 'check', options: RECORD_KIND_IDS },
    initialTags: { control: 'check', options: TAGS },
    frame: { control: 'inline-radio', options: ['wide', 'narrow'] },
  },
  args: { initialKinds: RECORD_KIND_IDS, initialTags: [], frame: 'wide' },
  render: (args) => <StatefulRail key={JSON.stringify(args)} {...args} />,
};

export const Default = {};

export const DefaultDark = { globals: { theme: 'g100' } };

// Two tags selected: the count badge beside "Tags".
export const TagsSelected = { args: { initialTags: ['baseline', 'workflow'], initialKinds: ['raw', 'finding'] } };

export const TagsSelectedDark = { ...TagsSelected, globals: { theme: 'g100' } };

// The md floor: the button keeps its label on one line by dropping the icon.
export const MdFloor = { args: { frame: 'narrow', initialTags: ['baseline'] } };

export const MdFloorDark = { ...MdFloor, globals: { theme: 'g100' } };
