import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    Form, Stack, TextInput, TextArea, Select, SelectItem,
    DatePicker, DatePickerInput, Button, InlineNotification,
} from '@carbon/react';
import { useCreateSession } from './api/records';

const RESEARCH_TYPES = [
    'usability-test', 'interview', 'survey',
    'contextual-inquiry', 'accessibility-audit', 'analytics',
];

function slugify(text) {
    return text
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

export default function CreateSessionForm({ onClose }) {
    const queryClient = useQueryClient();
    const createSession = useCreateSession();

    const [title, setTitle] = useState('');
    const [type, setType] = useState('');
    const [topicSlug, setTopicSlug] = useState('');
    const [tags, setTags] = useState('');
    const [relatedComponents, setRelatedComponents] = useState('');
    const [relatedFindings, setRelatedFindings] = useState('');
    const [researcher, setResearcher] = useState('');
    const [methodLabel, setMethodLabel] = useState('');
    const [date, setDate] = useState('');

    function handleSubmit(event) {
        event.preventDefault();
        createSession.mutate(
            { title, type, topicSlug, tags, relatedComponents, relatedFindings, researcher, methodLabel, date },
            {
                onSuccess: () => {
                    queryClient.invalidateQueries({ queryKey: ['records'] });
                    onClose();
                },
            },
        );
    }

    return (
        <Form onSubmit={handleSubmit} aria-label="Create new research session">
            <Stack gap={6}>
                <TextInput
                    id="title"
                    labelText="Title (required)"
                    value={title}
                    onChange={(e) => {
                        setTitle(e.target.value);
                        setTopicSlug(slugify(e.target.value));
                    }}
                    required
                />

                <Select
                    id="type"
                    labelText="Type (required)"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    required
                >
                    <SelectItem value="" text="Choose a type" />
                    {RESEARCH_TYPES.map((t) => (
                        <SelectItem key={t} value={t} text={t} />
                    ))}
                </Select>

                <TextInput
                    id="topicSlug"
                    labelText="Topic slug (auto-generated from title) (required)"
                    helperText="Lowercase letters, numbers, and hyphens only"
                    value={topicSlug}
                    onChange={(e) => setTopicSlug(slugify(e.target.value))}
                    required
                />

                <TextInput
                    id="tags"
                    labelText="Tags"
                    helperText="Comma-separated, e.g. onboarding, usability, mobile"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                />

                <TextInput
                    id="relatedComponents"
                    labelText="Related components"
                    helperText="Comma-separated component slugs, optional"
                    value={relatedComponents}
                    onChange={(e) => setRelatedComponents(e.target.value)}
                />

                <TextInput
                    id="relatedFindings"
                    labelText="Related findings"
                    helperText="Comma-separated findings/*.md filenames, optional"
                    value={relatedFindings}
                    onChange={(e) => setRelatedFindings(e.target.value)}
                />

                <TextInput
                    id="researcher"
                    labelText="Researcher"
                    value={researcher}
                    onChange={(e) => setResearcher(e.target.value)}
                />

                <TextArea
                    id="methodLabel"
                    labelText="Method"
                    helperText="e.g. Moderated usability test, 5 task scenarios, 45 min/session"
                    value={methodLabel}
                    onChange={(e) => setMethodLabel(e.target.value)}
                />

                <DatePicker
                    datePickerType="single"
                    onChange={(dates) => setDate(dates[0] ? dates[0].toISOString().slice(0, 10) : '')}
                >
                    <DatePickerInput id="date" labelText="Date" placeholder="yyyy-mm-dd" />
                </DatePicker>

                {createSession.isError && (
                    <InlineNotification
                        kind="error"
                        title="Failed to create session"
                        subtitle={createSession.error.message}
                    />
                )}

                <Button type="submit" disabled={createSession.isPending}>
                    {createSession.isPending ? 'Creating…' : 'Create session'}
                </Button>
            </Stack>
        </Form>
    );
}