import BreadcrumbBar from './BreadcrumbBar';

// Shared by both pages (Ask the Repo, and Research Records with its record
// count on the right), so grouped under Shared/Core with the other
// cross-page pieces rather than under Ask the Repo, where the file lives.
export default {
  title: 'Shared/Core/BreadcrumbBar',
  component: BreadcrumbBar,
  parameters: { layout: 'fullscreen' },
  argTypes: {
    current: { control: 'text' },
    meta: { control: 'text' },
  },
};

export const AskTheRepo = {};

export const ResearchRecords = {
  args: { current: 'Research Records', meta: '18 of 18 records' },
};

export const ResearchRecordsDark = {
  ...ResearchRecords,
  globals: { theme: 'g100' },
};
