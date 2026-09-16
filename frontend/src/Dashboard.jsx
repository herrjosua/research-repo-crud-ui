import { useState, useMemo } from 'react';
import { Grid, Column, Checkbox, Tag, ClickableTile, InlineNotification } from '@carbon/react';
import { useRecords } from './api/records';
import RecordDetail from './RecordDetail';

import styles from './Dashboard.module.scss';

const ALL_KINDS = ['raw', 'finding', 'component', 'analytics', 'deliverable'];

export default function Dashboard() {
  const records = useRecords();
  const [activeKinds, setActiveKinds] = useState(new Set(ALL_KINDS));
  const [activeTags, setActiveTags] = useState(new Set());
  const [selectedId, setSelectedId] = useState(null);

  const allTags = useMemo(() => {
    if (!records.data) return [];
    const set = new Set();
    records.data.forEach((r) => r.tags.forEach((t) => set.add(t)));
    return [...set].sort();
  }, [records.data]);

  const filtered = useMemo(() => {
    if (!records.data) return [];
    return records.data.filter((r) => {
      if (!activeKinds.has(r.kind)) return false;
      if (activeTags.size > 0 && ![...activeTags].every((t) => r.tags.includes(t))) return false;
      return true;
    });
  }, [records.data, activeKinds, activeTags]);

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

  function toggleTag(tag) {
    setActiveTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
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
        <fieldset>
          <legend>Tags</legend>
          {allTags.map((tag) => (
            <Checkbox
              key={tag}
              id={`tag-${tag}`}
              labelText={tag}
              checked={activeTags.has(tag)}
              onChange={() => toggleTag(tag)}
            />
          ))}
        </fieldset>
      </Column>

      <Column lg={12} md={6} sm={4}>
        <p>{filtered.length} of {records.data.length} records</p>
        {filtered.length === 0 && (
          <InlineNotification
            kind="info"
            title="No matching records"
            subtitle="Try unchecking a filter in the sidebar."
            lowContrast
          />
        )}
        {filtered.map((record) => (
            <ClickableTile
                key={record.id}
                onClick={() => setSelectedId(record.id)}
                className={styles.tile}
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
