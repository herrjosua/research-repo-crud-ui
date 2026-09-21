import { useState, useMemo } from 'react';
import { Grid, Column, Checkbox, Tag, ClickableTile, InlineNotification, Button, Modal, Search } from '@carbon/react';
import CreateSessionForm from './CreateSessionForm';
import { useRecords } from './api/records';
import RecordDetail from './RecordDetail';

import styles from './Dashboard.module.scss';

const ALL_KINDS = ['raw', 'finding', 'component', 'analytics', 'deliverable'];

export default function Dashboard() {
  const records = useRecords();
  const [activeKinds, setActiveKinds] = useState(new Set(ALL_KINDS));

  function highlightMatch(text, query) {
    const trimmed = query.trim();
    if (!trimmed) return text;
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = text.split(new RegExp(`(${escaped})`, 'gi'));
    return parts.map((part, i) =>
        part.toLowerCase() === trimmed.toLowerCase() ? <mark key={i} className={styles.highlight}>{part}</mark> : part
    );
  }

  const [activeTags, setActiveTags] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [tagQuery, setTagQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const allTags = useMemo(() => {
    if (!records.data) return [];
    const set = new Set();
    records.data.forEach((r) => r.tags.forEach((t) => set.add(t)));
    return [...set].sort();
  }, [records.data]);

  const visibleTags = useMemo(() => {
    const query = tagQuery.trim().toLowerCase();
    if (!query) return allTags;
    return allTags.filter((t) => t.toLowerCase().includes(query));
  }, [allTags, tagQuery]);

  const filtered = useMemo(() => {
    if (!records.data) return [];
    const query = searchQuery.trim().toLowerCase();
    return records.data.filter((r) => {
      if (!activeKinds.has(r.kind)) return false;
      if (activeTags.size > 0 && ![...activeTags].every((t) => r.tags.includes(t))) return false;
      if (query && !r.title.toLowerCase().includes(query) && !r.type.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [records.data, activeKinds, activeTags, searchQuery]);

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
        <Search
            labelText="Search records"
            placeholder="Search records"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onClear={() => setSearchQuery('')}
        />
        <fieldset className={styles.fieldset}>
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
        <fieldset className={styles.fieldset}>
          <legend>Tags{activeTags.size > 0 && ` (${activeTags.size} selected)`}</legend>
          <Search
              size="sm"
              labelText="Filter tags"
              placeholder="Filter tags"
              value={tagQuery}
              onChange={(e) => setTagQuery(e.target.value)}
              onClear={() => setTagQuery('')}
          />
          <div className={styles.tagList}>
            {visibleTags.map((tag) => (
                <Checkbox
                    key={tag}
                    id={`tag-${tag}`}
                    labelText={tag}
                    checked={activeTags.has(tag)}
                    onChange={() => toggleTag(tag)}
                />
            ))}
          </div>
        </fieldset>
      </Column>

      <Column lg={12} md={6} sm={4}>
        <h1>Research Records</h1>
        <Button onClick={() => setShowCreateForm(true)}>New session</Button>
        <p>{filtered.length} of {records.data.length} records</p>
        {filtered.length === 0 && (
            <InlineNotification
                kind="info"
                title="No matching records"
                subtitle="Try unchecking a filter or clearing your search."
                lowContrast
            />
        )}
        {filtered.map((record) => (
            <ClickableTile
                key={record.id}
                onClick={() => setSelectedId(record.id)}
                className={styles.tile}
            >
              <h2>{highlightMatch(record.title, searchQuery)}</h2>
              <p>{record.date} · {highlightMatch(record.type, searchQuery)}</p>
            {record.tags.map((tag) => (
              <Tag key={tag} type="blue">{tag}</Tag>
            ))}
          </ClickableTile>
        ))}
      </Column>

      {showCreateForm && (
          <Modal
              open
              modalHeading="New research session"
              passiveModal
              onRequestClose={() => setShowCreateForm(false)}
          >
            <CreateSessionForm onClose={() => setShowCreateForm(false)} />
          </Modal>
      )}

      {selectedId && (
        <RecordDetail id={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </Grid>
  );
}
