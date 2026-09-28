import { useState, useMemo, useRef, useEffect } from 'react';
import { Grid, Column, Tag, ClickableTile, InlineNotification, Layer, Modal } from '@carbon/react';
import CreateSessionForm from './CreateSessionForm';
import { useRecords } from './api/records';
import RecordDetail from './RecordDetail';
import RecordsRail from './RecordsRail';
import RecordKindTag from './RecordKindTag';
import BreadcrumbBar from './ask-the-repo/shell/BreadcrumbBar';
import { RECORD_KIND_IDS } from './recordKinds';

import styles from './Dashboard.module.scss';

const ALL_KINDS = RECORD_KIND_IDS;

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
  const [deleteWarning, setDeleteWarning] = useState(null);
  const headingRef = useRef(null);
  const focusHeadingAfterDelete = useRef(false);

  // The deleted record's tile is gone, so there's no launcher to return focus
  // to. Focus the list heading once the detail modal has unmounted.
  useEffect(() => {
    if (!selectedId && focusHeadingAfterDelete.current) {
      focusHeadingAfterDelete.current = false;
      headingRef.current?.focus();
    }
  }, [selectedId]);

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

  if (records.isLoading) {
    return (
      <Grid>
        <Column sm={4} md={8} lg={16}>
          <p className={styles.loading}>Loading records…</p>
        </Column>
      </Grid>
    );
  }
  if (records.isError) {
    return (
      <Grid>
        <Column sm={4} md={8} lg={16}>
          <InlineNotification kind="error" title="Failed to load records" subtitle={records.error.message} />
        </Column>
      </Grid>
    );
  }

  // Same page structure as AskTheRepo.jsx: BreadcrumbBar, then a full-width
  // Grid/Column holding a `narrow` Grid with the rail (lg=4/md=2) beside the
  // content — so the two pages' rails and content share one left edge.
  return (
    <div className={styles.page}>
      <BreadcrumbBar
        current="Research Records"
        meta={`${filtered.length} of ${records.data.length} records`}
      />
      <Grid>
        <Column sm={4} md={8} lg={16} className={styles.rowInset}>
          <Grid narrow className={styles.row}>
            <Column lg={4} md={2} sm={4}>
              <RecordsRail
                onNewSession={() => setShowCreateForm(true)}
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                activeKinds={activeKinds}
                onToggleKind={toggleKind}
                tags={visibleTags}
                activeTags={activeTags}
                onToggleTag={toggleTag}
                tagQuery={tagQuery}
                onTagQueryChange={setTagQuery}
              />
            </Column>

            <Column lg={12} md={6} sm={4} className={styles.content}>
              <h1 ref={headingRef} tabIndex={-1} className={styles.heading}>Research Records</h1>
              {deleteWarning && (
                  <InlineNotification
                      kind="warning"
                      title="Deleted, but the index reported issues"
                      subtitle={deleteWarning}
                      lowContrast
                      onClose={() => setDeleteWarning(null)}
                  />
              )}
              {filtered.length === 0 && (
                  <InlineNotification
                      kind="info"
                      title="No matching records"
                      subtitle="Try unchecking a filter or clearing your search."
                      lowContrast
                  />
              )}
              {/* The cards sit one layer above the content surface
                  (`$layer-01`), so Carbon's Layer gives ClickableTile the
                  next layer's background, hover and border tokens. */}
              <Layer>
                {filtered.map((record) => (
                    <ClickableTile
                        key={record.id}
                        onClick={() => setSelectedId(record.id)}
                        className={`${styles.tile} ${styles[record.kind] ?? ''}`}
                    >
                      <div className={styles.meta}>
                        <RecordKindTag kind={record.kind} />
                        <span>{record.date} · {highlightMatch(record.type, searchQuery)}</span>
                      </div>
                      <h2 className={styles.title}>{highlightMatch(record.title, searchQuery)}</h2>
                      <div className={styles.tags}>
                        {record.tags.map((tag) => (
                          <Tag key={tag} type="gray" size="sm">{tag}</Tag>
                        ))}
                      </div>
                    </ClickableTile>
                ))}
              </Layer>
            </Column>
          </Grid>
        </Column>
      </Grid>

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
        <RecordDetail
          id={selectedId}
          onClose={() => setSelectedId(null)}
          onDeleted={(warning) => {
            setDeleteWarning(warning ?? null);
            focusHeadingAfterDelete.current = true;
            setSelectedId(null);
          }}
        />
      )}
    </div>
  );
}
