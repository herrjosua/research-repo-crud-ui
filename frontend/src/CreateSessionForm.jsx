import { useState, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
    Form, Stack, TextInput, TextArea, Select, SelectItem, Dropdown,
    DatePicker, DatePickerInput, Button, InlineNotification,
} from '@carbon/react';
import { useMe, useUsers } from './api/auth';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import {
    ClassicEditor,
    Essentials,
    Paragraph,
    Heading,
    Bold,
    Italic,
    Code,
    Link,
    List,
    BlockQuote,
    Markdown,
} from 'ckeditor5';
import 'ckeditor5/ckeditor5.css';
import { useCreateSession } from './api/records';

const RESEARCH_TYPES = [
    'usability-test', 'interview', 'survey',
    'contextual-inquiry', 'accessibility-audit', 'analytics',
];

const STARTER_CONTENT = `## Objective


## Method
- **Method:** 
- **Researcher:** 

## Key Findings
- **[SEVERITY]** *(theme)* 

## Representative Quotes
> ""
> — Role, participant ID

## Recommendations
1. 

## Follow-ups / Open Questions
- 
`;

const EDITOR_CONFIG = {
    licenseKey: 'GPL',
    plugins: [Essentials, Paragraph, Heading, Bold, Italic, Code, Link, List, BlockQuote, Markdown],
    toolbar: ['heading', '|', 'bold', 'italic', 'code', 'link', '|', 'bulletedList', 'numberedList', 'blockQuote'],
};

// Mirrors the backend's SAFE_SLUG_RE in records.js exactly — kept as its
// own check (rather than only trusting slugify() to always produce a valid
// result) because a title made entirely of symbols/whitespace slugifies
// down to an empty string, which passes slugify() fine but still fails the
// backend's "topicSlug must match ^[a-z0-9-]+$" check.
const SLUG_PATTERN = /^[a-z0-9-]+$/;

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
    const me = useMe();
    const isLead = !!me.data?.is_lead;
    const users = useUsers();

    const [title, setTitle] = useState('');
    const [type, setType] = useState('');
    const [topicSlug, setTopicSlug] = useState('');
    const [tags, setTags] = useState('');
    const [relatedComponents, setRelatedComponents] = useState('');
    const [relatedFindings, setRelatedFindings] = useState('');
    const [researcher, setResearcher] = useState('');
    const [methodLabel, setMethodLabel] = useState('');
    const [date, setDate] = useState('');
    const [content, setContent] = useState(STARTER_CONTENT);
    const [attemptedSubmit, setAttemptedSubmit] = useState(false);

    const titleInvalid = attemptedSubmit && title.trim() === '';
    const typeInvalid = attemptedSubmit && type === '';
    const topicSlugInvalid = attemptedSubmit && !SLUG_PATTERN.test(topicSlug);

    // Researcher is auto-derived from the logged-in user — default it once
    // their identity loads, rather than leaving it blank until they touch it.
    useEffect(() => {
        if (me.data && !researcher) {
            setResearcher(me.data.git_name);
        }
    }, [me.data]);

    function handleSubmit(event) {
        event.preventDefault();
        setAttemptedSubmit(true);

        if (title.trim() === '' || type === '' || !SLUG_PATTERN.test(topicSlug)) {
            return;
        }

        createSession.mutate(
            { title, type, topicSlug, tags, relatedComponents, relatedFindings, researcher, methodLabel, date, content },
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
                    placeholder="e.g. Contextual Inquiry — Home Health Nurses"
                    value={title}
                    onChange={(e) => {
                        setTitle(e.target.value);
                        setTopicSlug(slugify(e.target.value));
                    }}
                    invalid={titleInvalid}
                    invalidText="Title is required."
                    required
                />

                <Select
                    id="type"
                    labelText="Type (required)"
                    helperText="What kind of research activity this is"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    invalid={typeInvalid}
                    invalidText="Choose a type."
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
                    invalid={topicSlugInvalid}
                    invalidText="Title must contain at least one letter or number to generate a valid slug."
                    required
                />

                <TextInput
                    id="tags"
                    labelText="Tags"
                    placeholder="onboarding, usability, mobile"
                    helperText="Comma-separated, e.g. onboarding, usability, mobile"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                />

                <TextInput
                    id="relatedComponents"
                    labelText="Related components"
                    placeholder="ambient-scribe-widget, encounter-view"
                    helperText="Comma-separated component slugs, optional"
                    value={relatedComponents}
                    onChange={(e) => setRelatedComponents(e.target.value)}
                />

                <TextInput
                    id="relatedFindings"
                    labelText="Related findings"
                    placeholder="ambient-scribe.md, governance-and-phi.md"
                    helperText="Comma-separated findings/*.md filenames, optional"
                    value={relatedFindings}
                    onChange={(e) => setRelatedFindings(e.target.value)}
                />

                {isLead ? (
                    <Dropdown
                        id="researcher"
                        titleText="Researcher"
                        label="Choose who ran this session"
                        helperText="As a lead, you can attribute this to someone else"
                        items={users.data ?? []}
                        itemToString={(item) => item?.git_name ?? ''}
                        selectedItem={(users.data ?? []).find((u) => u.git_name === researcher) ?? null}
                        onChange={({ selectedItem }) => setResearcher(selectedItem?.git_name ?? '')}
                    />
                ) : (
                    <TextInput
                        id="researcher"
                        labelText="Researcher"
                        helperText="Automatically attributed to you"
                        value={researcher}
                        disabled
                    />
                )}

                <TextArea
                    id="methodLabel"
                    labelText="Method"
                    placeholder="e.g. Moderated usability test, 5 task scenarios, 45 min/session"
                    helperText="A one-line description of how this session was run"
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

                {attemptedSubmit && !createSession.isError && (title.trim() === '' || type === '' || !SLUG_PATTERN.test(topicSlug)) && (
                    <InlineNotification
                        kind="error"
                        title="Please fix the highlighted fields"
                        subtitle="Title, type, and a valid topic slug are all required before this can be created."
                        hideCloseButton
                    />
                )}

                <div>
                    <label htmlFor="content-editor" className="cds--label">Content (optional)</label>
                    <p className="cds--form__helper-text">
                        Starts pre-filled with a standard synthesis template — edit freely. This becomes the
                        raw markdown body of the session file.
                    </p>
                    <CKEditor
                        id="content-editor"
                        editor={ClassicEditor}
                        config={EDITOR_CONFIG}
                        data={content}
                        onChange={(event, editor) => setContent(editor.getData())}
                    />
                </div>

                <Button type="submit" disabled={createSession.isPending}>
                    {createSession.isPending ? 'Creating…' : 'Create session'}
                </Button>
            </Stack>
        </Form>
    );
}
