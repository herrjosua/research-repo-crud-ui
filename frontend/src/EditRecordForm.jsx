import { useState } from 'react';
import { TextInput, Dropdown, Button, InlineNotification, Stack, Form } from '@carbon/react';
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

const EDITOR_CONFIG = {
    licenseKey: 'GPL',
    plugins: [Essentials, Paragraph, Heading, Bold, Italic, Code, Link, List, BlockQuote, Markdown],
    toolbar: ['heading', '|', 'bold', 'italic', 'code', 'link', '|', 'bulletedList', 'numberedList', 'blockQuote'],
};

export default function EditRecordForm({ record, onClose }) {
    const updateRecord = useUpdateRecord(record.id);

    const [title, setTitle] = useState(record.title);
    const [status, setStatus] = useState(record.status || '');
    const [tags, setTags] = useState(record.tags.join(', '));
    const [content, setContent] = useState(record.rawContent);
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
