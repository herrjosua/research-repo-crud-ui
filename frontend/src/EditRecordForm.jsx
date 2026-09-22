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
    const [tags, setTags] = useState(record.tags.join(', '));
    const [content, setContent] = useState(record.rawContent);
    const [attributionValue, setAttributionValue] = useState(
        attributionField ? (record[attributionField] || me.data?.git_name || '') : '',
    );
    const [attemptedSubmit, setAttemptedSubmit] = useState(false);

    const titleInvalid = attemptedSubmit && title.trim() === '';
    const statusInvalid = attemptedSubmit && status === '';

    function handleSubmit(event) {
        event.preventDefault();
        setAttemptedSubmit(true);

        if (title.trim() === '' || status === '') {
            return;
        }

        updateRecord.mutate(
            {
                frontmatter: {
                    title,
                    status,
                    tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
                    ...(attributionField ? { [attributionField]: attributionValue } : {}),
                },
                content,
            },
            { onSuccess: onClose },
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

                <TextInput
                    id="edit-tags"
                    labelText="Tags"
                    placeholder="onboarding, usability, mobile"
                    helperText="Comma-separated, e.g. onboarding, usability, mobile"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
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
