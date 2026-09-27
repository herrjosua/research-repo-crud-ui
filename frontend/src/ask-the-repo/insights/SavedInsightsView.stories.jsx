import { useState } from 'react';
import SavedInsightsView from './SavedInsightsView';
import { SAMPLE_INSIGHTS } from '../mock/insights';
import { PROJECTS } from '../mock/constants';
import styles from './SavedInsightsView.stories.module.scss';

// The view's data is a list, so Controls offers a closed set of real
// cases (mapped to real fixture arrays from mock/insights.js) rather than
// a free-form JSON editor.
const INSIGHT_SETS = {
  'Two projects + Other': SAMPLE_INSIGHTS,
  'One project only': SAMPLE_INSIGHTS.filter((insight) => insight.project === 'checkout'),
  'Only unmatched (Other)': SAMPLE_INSIGHTS.filter((insight) => insight.project === 'Payments Benchmark'),
  'Empty': [],
};

// Grouped under Ask the Repo, next to InsightCard. No PropTypes/TS, so
// `argTypes` is explicit (same reasoning as sources/KindTag.stories.jsx).
// Every story renders inside `.frame`, a fixed-height box standing in for
// the tab panel: the view scrolls its own overflow, which needs a bounded
// parent (AskTheRepo's height chain in the real page).
export default {
  title: 'Ask the Repo/SavedInsightsView',
  component: SavedInsightsView,
  argTypes: {
    insights: {
      control: 'select',
      options: Object.keys(INSIGHT_SETS),
      mapping: INSIGHT_SETS,
    },
    projects: { control: false },
  },
  parameters: { layout: 'fullscreen' },
};

// Live-editable playground. Remove is wired through local state, so
// removing an insight in the canvas really drops it (and its group, once
// empty). Switching `insights` in Controls resets the list.
function RemovableView(args) {
  const [insights, setInsights] = useState(args.insights);
  const [source, setSource] = useState(args.insights);
  if (source !== args.insights) {
    setSource(args.insights);
    setInsights(args.insights);
  }
  return (
    <div className={styles.frame}>
      <SavedInsightsView
        {...args}
        insights={insights}
        onRemove={(id) => setInsights((prev) => prev.filter((insight) => insight.id !== id))}
      />
    </div>
  );
}

export const Default = {
  args: {
    insights: 'Two projects + Other',
    projects: PROJECTS,
  },
  render: (args) => <RemovableView {...args} />,
};

// Nothing saved yet — the empty state, still under the session-only notice.
export const Empty = {
  args: {
    insights: 'Empty',
    projects: PROJECTS,
  },
  render: (args) => <RemovableView {...args} />,
};
