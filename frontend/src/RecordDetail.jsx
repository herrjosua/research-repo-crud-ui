import { Modal, Tag, InlineNotification } from '@carbon/react';
import { useRecord } from './api/records';

export default function RecordDetail({ id, onClose }) {
    const record = useRecord(id);

    return (
        <Modal
            open
            modalHeading={record.data ? record.data.title : 'Loading…'}
            passiveModal
            onRequestClose={onClose}
        >
            {record.isLoading && <p>Loading…</p>}

            {record.isError && (
                <InlineNotification
                    kind="error"
                    title="Failed to load record"
                    subtitle={record.error.message}
                />
            )}

            {record.data && (
                <>
                    <p>{record.data.date} · {record.data.type}</p>
                    {record.data.tags.map((tag) => (
                        <Tag key={tag} type="blue">{tag}</Tag>
                    ))}
                    <div dangerouslySetInnerHTML={{ __html: record.data.html }} />
                </>
            )}
        </Modal>
    );
}