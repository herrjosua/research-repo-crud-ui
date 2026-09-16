import { useState } from 'react';
import { TextInput, TextArea, Dropdown, Button, InlineNotification, Stack, Form } from '@carbon/react';
import { useUpdateRecord } from './api/records';

const STATUS_OPTIONS = ['raw', 'in-review', 'synthesized', 'draft', 'final', 'superseded'];

export default function EditRecordForm({ record, onClose }) {
    const updateRecord = useUpdateRecord(record.id);

    const [title, setTitle] = useState(record.title);
    const [status, setStatus] = useState(record.status || '');
    const [tags, setTags] = useState(record.tags.join(', '));
    const [content, setContent] = useState(record.rawContent);

    function handleSubmit(event) {
        event.preventDefault();
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
                />

                <Dropdown
                    id="edit-status"
                    titleText="Status"
                    label="Choose a status"
                    items={STATUS_OPTIONS}
                    selectedItem={status || null}
                    onChange={({ selectedItem }) => setStatus(selectedItem)}
                />

                <TextInput
                    id="edit-tags"
                    labelText="Tags"
                    helperText="Comma-separated"
                    value={tags}
                    onChange={(e) => setTags(e.target.value)}
                />

                <TextArea
                    id="edit-content"
                    labelText="Content"
                    helperText="Raw markdown"
                    rows={20}
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                />

                {updateRecord.isError && (
                    <InlineNotification
                        kind="error"
                        title="Failed to save changes"
                        subtitle={updateRecord.error.message}
                    />
                )}

                <Button type="submit" disabled={updateRecord.isPending}>
                    {updateRecord.isPending ? 'Saving…' : 'Save changes'}
                </Button>
            </Stack>
        </Form>
    );
}