import StarterQuestions from './StarterQuestions';
import { STARTERS } from '../fixtures/starters';

// Grouped under Ask the Repo, alongside the rest of the chat panel. No
// PropTypes/TS on StarterQuestions, so `argTypes` is given explicitly
// (same reasoning as sources/KindTag.stories.jsx); `questions` is a
// closed choice of one of the fixture `STARTERS` lists, so `select` (keyed
// by project id) is the real control, not a free-text array.
export default {
  title: 'Ask the Repo/StarterQuestions',
  component: StarterQuestions,
  argTypes: {
    questions: {
      control: 'select',
      options: Object.keys(STARTERS),
      mapping: STARTERS,
    },
  },
};

// Live-editable playground: flip `questions` in Controls between project
// starter sets, and watch onSelect calls land in the Actions panel on
// click — ChatPanel wires that into filling the composer, not sending
// immediately (see StarterQuestions.jsx's doc comment for why that
// differs from the reference).
export const Default = {
  args: {
    questions: 'checkout',
  },
};
