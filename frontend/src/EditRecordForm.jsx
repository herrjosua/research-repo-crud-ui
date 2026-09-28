import { useState } from 'react';
import { TextInput, Dropdown, Button, InlineNotification, Stack, Form } from '@carbon/react';
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
import { useUpdateRecord } from './api/records';

const STATUS_OPTIONS = ['raw', 'in-review', 'synthesized', 'draft', 'final', 'superseded'];

// Mirrors the backend's attributionField() in records.js exactly: which
// frontmatter field (if any) carries attribution for a given record kind —
// researcher on raw/finding/analytics, designer on deliverables (evaluator
// instead for the heuristic-evaluations subtype), nothing on components.
function attributionFieldFor(record) {
    if (record.kind === 'raw' || record.kind === 'finding' || record.kind === 'analytics') return 'researcher';
    if (record.kind === 'deliverable') return record.type === 'heuristic-evaluations' ? 'evaluator' : 'designer';
    return null;
}

// agentic-repo gives every record exactly one project-* tag. The backend's
// PUT keeps a finding, analytics summary or deliverable's existing one and
// never writes one into a raw session (see backend/projects.js), so the
// project is shown read-only here and kept out of the editable tags.
const isProjectTag = (tag) => tag.startsWith('project-');

// Raw sessions get their project from research/projects.yml; every other
// kind carries it in its own frontmatter.
function projectHelperText(record) {
    return record.kind === 'raw'
        ? 'Assigned in research/projects.yml, not in the session itself'
        : 'Each record keeps its one project tag; it can\'t be changed here';
}

const ATTRIBUTION_LABELS = { researcher: 'Researcher', designer: 'Designer', evaluator: 'Evaluator' };

const EDITOR_CONFIG = {
    licenseKey: 'GPL',
    plugins: [Essentials, Paragraph, Heading, Bold, Italic, Code, Link, List, BlockQuote, Markdown],
    toolbar: ['heading', '|', 'bold', 'italic', 'code', 'link', '|', 'bulletedList', 'numberedList', 'blockQuote'],
};

export default function EditRecordForm({ record, onClose }) {
    const updateRecord = useUpdateRecord(record.id);
    const me = useMe();
    const isLead = !!me.data?.is_lead;
    const users = useUsers();
    const attributionField = attributionFieldFor(record);

    const [title, setTitle] = useState(record.title);
    const [status, setStatus] = useState(record.status || '');
    const projectTags = record.tags.filter(isProjectTag);
    const [tags, setTags] = useState(record.tags.filter((tag) => !isProjectTag(tag)).join(', '));
    const [content, setContent] = useState(record.rawContent);
    const [attributionValue, setAttributionValue] = useState(
        attributionField ? (record[attributionField] || me.data?.git_name || '') : '',
    );
    const [attemptedSubmit, setAttemptedSubmit] = useState(false);

    const titleInvalid = attemptedSubmit && title.trim() === '';
    const statusInvalid = attemptedSubmit && status === '';
    const tagList = tags.split(',').map((t) => t.trim()).filter(Boolean);
    const tagsInvalid = tagList.some(isProjectTag);

    function handleSubmit(event) {
        event.preventDefault();
        setAttemptedSubmit(true);

        if (title.trim() === '' || status === '' || tagsInvalid) {
            return;
        }

        updateRecord.mutate(
            {
                frontmatter: {
                    title,
                    status,
                    // Sent back unchanged; the server decides what to keep.
                    tags: [...tagList, ...projectTags],
                    ...(attributionField ? { [attributionField]: attributionValue } : {}),
                },
                content,
            },
            // PUT can succeed with a build_index.py warning; hand it up so
            // RecordDetail can show it once the form closes.
            { onSuccess: (data) => onClose(data?.warning) },
        );
    }

    return (
        <Form onSubmit={handleSubmit} aria-label="Edit record">
            <Stack gap={6}>
                <TextInput
                    id="edit-title"
                    labelText="Title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    invalid={titleInvalid}
                    invalidText="Title can't be blank."
                    required
                />

                <Dropdown
                    id="edit-status"
                    titleText="Status"
                    label="Choose a status"
                    helperText="Where this record is in its lifecycle"
                    items={STATUS_OPTIONS}
                    selectedItem={status || null}
                    onChange={({ selectedItem }) => setStatus(selectedItem)}
                    invalid={statusInvalid}
                    invalidText="Choose a status — leaving this blank would overwrite the record's current status."
                />

                {projectTags.length > 0 && (
                    <TextInput
                        id="edit-project"
                        labelText="Project"
                        helperText={projectHelperText(record)}
                        value={projectTags.join(', ')}
                        readOnly
                    />
                )}

                <TextInput
                    id="edit-tags"
                    labelText="Tags"
                    placeholder="onboarding, usability, mobile"
                    helperText="Comma-separated, e.g. onboarding, usability, mobile"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                    invalid={tagsInvalid}
                    invalidText="Remove project-* tags from this list. A record's project can't be edited here."
                />

                {attributionField && (
                    isLead ? (
                        <Dropdown
                            id="edit-attribution"
                            titleText={ATTRIBUTION_LABELS[attributionField]}
                            label={`Choose who is credited as ${ATTRIBUTION_LABELS[attributionField].toLowerCase()}`}
                            helperText="As a lead, you can reassign this"
                            items={users.data ?? []}
                            itemToString={(item) => item?.git_name ?? ''}
                            selectedItem={(users.data ?? []).find((u) => u.git_name === attributionValue) ?? null}
                            onChange={({ selectedItem }) => setAttributionValue(selectedItem?.git_name ?? '')}
                        />
                    ) : (
                        <TextInput
                            id="edit-attribution"
                            labelText={ATTRIBUTION_LABELS[attributionField]}
                            helperText="Only a lead can reassign this"
                            value={attributionValue}
                            disabled
                        />
                    )
                )}

                <div>
                    <label htmlFor="edit-content-editor" className="cds--label">Content</label>
                    <p className="cds--form__helper-text">
                        Markdown source — this is what the search UI and other tools render directly.
                    </p>
                    <CKEditor
                        id="edit-content-editor"
                        editor={ClassicEditor}
                        config={EDITOR_CONFIG}
                        data={content}
                        onChange={(event, editor) => setContent(editor.getData())}
                    />
                </div>

                {updateRecord.isError && (
                    <InlineNotification
                        kind="error"
                        title="Failed to save changes"
                        subtitle={updateRecord.error.message}
                    />
                )}

                {attemptedSubmit && !updateRecord.isError && (title.trim() === '' || status === '') && (
                    <InlineNotification
                        kind="error"
                        title="Please fix the highlighted fields"
                        subtitle="Title and status are both required before changes can be saved."
                        hideCloseButton
                    />
                )}

                <Button type="submit" disabled={updateRecord.isPending}>
                    {updateRecord.isPending ? 'Saving…' : 'Save changes'}
                </Button>
            </Stack>
        </Form>
    );
}
