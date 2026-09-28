import { useState } from 'react';
import { Modal } from '@carbon/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import EditRecordForm from './EditRecordForm';

// EditRecordForm reads the logged-in user and the user list through
// react-query. Seeding both queries (and never refetching) keeps every story
// offline; Save would call the real API, so stories are for looking at, not
// submitting.
function WithSeededQueries(Story) {
  const [queryClient] = useState(() => {
    const client = new QueryClient({
      defaultOptions: { queries: { staleTime: Infinity, retry: false }, mutations: { retry: false } },
    });
    client.setQueryData(['me'], { git_name: 'Priya Patel', is_lead: 0 });
    client.setQueryData(['users'], []);
    return client;
  });
  return (
    <QueryClientProvider client={queryClient}>
      <Story />
    </QueryClientProvider>
  );
}

// The form only ever renders inside RecordDetail's passive Modal, so every
// story renders it on that same layer. `docs.story.inline: false` for the
// same reason as SourceDetailModal.stories.jsx: a fixed-position modal would
// cover the autodocs page.
export default {
  title: 'Records/EditRecordForm',
  component: EditRecordForm,
  decorators: [WithSeededQueries],
  parameters: {
    layout: 'fullscreen',
    docs: { story: { inline: false, iframeHeight: 900 } },
  },
  render: (args) => (
    <Modal open passiveModal modalHeading={args.record.title} onRequestClose={() => {}}>
      <EditRecordForm {...args} />
    </Modal>
  ),
  args: { onClose: () => {} },
};

const finding = {
  id: 'finding:onboarding',
  kind: 'finding',
  title: 'Onboarding',
  status: 'synthesized',
  tags: ['onboarding', 'usability', 'project-onboarding'],
  rawContent: '# Onboarding\n\nAdmins stall at the calendar step.',
  researcher: 'Priya Patel',
};

// A finding's project tag lives in its own frontmatter: shown read-only,
// left out of the editable tags.
export const FindingWithProject = { args: { record: finding } };

export const FindingWithProjectDark = {
  args: { record: finding },
  globals: { theme: 'g100' },
};

// A raw session's project comes from research/projects.yml, so the helper
// text points there instead.
export const RawSessionWithProject = {
  args: {
    record: {
      id: 'raw:2026-01-19-onboarding-usability-test',
      kind: 'raw',
      title: 'Onboarding usability test',
      status: 'raw',
      tags: ['onboarding', 'usability', 'project-onboarding'],
      rawContent: '# Onboarding usability test',
      researcher: 'Priya Patel',
    },
  },
};

// A checkout without research/projects.yml (the test corpora): no project
// tag, so no Project field.
export const WithoutProject = {
  args: { record: { ...finding, tags: ['onboarding', 'usability'] } },
};
