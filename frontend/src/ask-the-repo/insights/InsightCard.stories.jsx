import { within, userEvent } from 'storybook/test';
import InsightCard from './InsightCard';
import { SAMPLE_INSIGHTS } from '../mock/insights';
import styles from './InsightCard.stories.module.scss';

const INSIGHTS_BY_LABEL = Object.fromEntries(
  SAMPLE_INSIGHTS.map((insight) => [`${insight.sourceKind} — ${insight.title}`, insight])
);
const LONG_INSIGHT = SAMPLE_INSIGHTS.find((insight) => insight.content.length > 180);

// Grouped under Ask the Repo, next to the rest of the Saved Insights tab.
// No PropTypes/TS, so `argTypes` is explicit (same reasoning as
// sources/KindTag.stories.jsx); `insight` is a `select` over the real
// fixtures in mock/insights.js, mapped to the real objects.
//
// Every story renders on `.page` — the tab's own `$background`, which is
// the only backdrop this card (a Carbon `Tile`, one layer up) sits on — so
// the Tile's `$layer-01` surface and its KindTag are judged against the
// real contrast pairing, not the raw story canvas.
export default {
  title: 'Ask the Repo/InsightCard',
  component: InsightCard,
  argTypes: {
    insight: {
      control: 'select',
      options: Object.keys(INSIGHTS_BY_LABEL),
      mapping: INSIGHTS_BY_LABEL,
    },
    onRemove: { action: 'removed' },
  },
  decorators: [
    (Story) => (
      <div className={styles.page}>
        <Story />
      </div>
    ),
  ],
};

// Live-editable playground: switch `insight` in Controls; the synthesis
// one is long enough to collapse behind "Show more".
export const Default = {
  args: {
    insight: Object.keys(INSIGHTS_BY_LABEL)[0],
  },
};

// Over the 180-character preview: collapsed, with "Show more".
export const LongCollapsed = {
  args: {
    insight: `${LONG_INSIGHT.sourceKind} — ${LONG_INSIGHT.title}`,
  },
};

// The same long insight after "Show more" — clicked by `play`, so the
// Chromatic snapshot captures the real expanded state (full text, "Show
// less", `aria-expanded="true"`) rather than a story-only prop.
export const LongExpanded = {
  args: LongCollapsed.args,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('button', { name: 'Show more' }));
  },
};

// The one KindTag kind with a custom (orange) override, on this card's
// Tile — the background this ticket adds for KindTag.
export const TranscriptSource = {
  args: {
    insight: Object.keys(INSIGHTS_BY_LABEL).find((label) => label.startsWith('transcript')),
  },
};
