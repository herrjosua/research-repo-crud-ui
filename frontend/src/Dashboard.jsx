import { useState, useMemo } from 'react';
import { Grid, Column, Checkbox, Tag, ClickableTile, InlineNotification } from '@carbon/react';
import { useRecords } from './api/records';
import RecordDetail from './RecordDetail';

const ALL_KINDS = ['raw', 'finding', 'component', 'analytics', 'deliverable'];

export default function Dashboard() {
    const records = useRecords();
    const [activeKinds, setActiveKinds] = useState(new Set(ALL_KINDS));
    const [selectedId, setSelectedId] = useState(null);

    const filtered = useMemo(() => {
        if (!records.data) return [];
        return records.data.filter((r) => activeKinds.has(r.kind));
    }, [records.data, activeKinds]);

    function toggleKind(kind) {
        setActiveKinds((prev) => {
            const next = new Set(prev);
            if (next.has(kind)) {
                next.delete(kind);
            } else {
                next.add(kind);
            }
            return next;
        });
    }

    if (records.isLoading) return <p>Loading records…</p>;
    if (records.isError) {
        return (
            <InlineNotification kind="error" title="Failed to load records" subtitle={records.error.message} />
        );
    }

    return (
        <Grid>
            <Column lg={4} md={2} sm={4}>
                <fieldset>
                    <legend>Kind</legend>
                    {ALL_KINDS.map((kind) => (
                        <Checkbox
                            key={kind}
                            id={`kind-${kind}`}
                            labelText={kind}
                            checked={activeKinds.has(kind)}
                            onChange={() => toggleKind(kind)}
                        />
                    ))}
                </fieldset>
            </Column>

            <Column lg={12} md={6} sm={4}>
                <p>{filtered.length} of {records.data.length} records</p>
                {filtered.map((record) => (
                    <ClickableTile
                        key={record.id}
                        onClick={() => setSelectedId(record.id)}
                        style={{ marginBottom: '1rem' }}
                    >
                        <h3>{record.title}</h3>
                        <p>{record.date} · {record.type}</p>
                        {record.tags.map((tag) => (
                            <Tag key={tag} type="blue">{tag}</Tag>
                        ))}
                    </ClickableTile>
                ))}
            </Column>

            {selectedId && (
                <RecordDetail id={selectedId} onClose={() => setSelectedId(null)} />
            )}
        </Grid>
    );
}