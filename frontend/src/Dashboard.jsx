import { useState, useMemo, useRef, useEffect, useId } from 'react';
import { Grid, Column, Tag, ClickableTile, InlineNotification, Layer, Modal } from '@carbon/react';
import CreateSessionForm from './CreateSessionForm';
import { useRecords } from './api/records';
import RecordDetail from './RecordDetail';
import { closeOnEscapeFromCloseButton } from './closeOnEscape';
import RecordsRail from './RecordsRail';
import RecordKindTag from './RecordKindTag';
import SkipLink from './SkipLink';
import BreadcrumbBar from './ask-the-repo/shell/BreadcrumbBar';
import { RECORD_KIND_IDS } from './recordKinds';

import styles from './Dashboard.module.scss';

const ALL_KINDS = RECORD_KIND_IDS;

export default function Dashboard() {
  // Unique per instance: the record cards' accessible names point at their own parts by id.
  const tileId = useId();
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
  const returnFocusTo = useRef(null);

  // Both dialogs here are mounted only while open, so Carbon never gets to
  // return focus to what opened them, and focus fell to the page (v1.3.6.64).
  // A screen reader then read the page title instead of the card it had just
  // left. Remember the opener and focus it again once the dialog has closed.
  // A deleted record's tile is gone, so there's no launcher to return focus
  // to; focus the list heading instead.
  useEffect(() => {
    if (selectedId || showCreateForm) return;
    if (focusHeadingAfterDelete.current) {
      focusHeadingAfterDelete.current = false;
      returnFocusTo.current = null;
      headingRef.current?.focus();
      return;
    }
    const opener = returnFocusTo.current;
    returnFocusTo.current = null;
    if (opener?.isConnected) opener.focus();
  }, [selectedId, showCreateForm]);

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
      {/* After the breadcrumb, before the filter rail: the rail is about 25
          stops, so a keyboard or screen reader user can jump past it to the
          records (v1.3.6.63). */}
      <SkipLink targetId="records-heading">Skip to records</SkipLink>
      <Grid>
        <Column sm={4} md={8} lg={16} className={styles.rowInset}>
          <Grid narrow className={styles.row}>
            <Column lg={4} md={2} sm={4}>
              <RecordsRail
                onNewSession={(event) => {
                  returnFocusTo.current = event?.currentTarget ?? document.activeElement;
                  setShowCreateForm(true);
                }}
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
              {/* A region named by its heading, and the cards in a list, so the
                  results are something a screen reader can find and count
                  (v1.3.6.63). */}
              <section aria-labelledby="records-heading">
                <h1 id="records-heading" ref={headingRef} tabIndex={-1} className={styles.heading}>Research Records</h1>
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
                  {filtered.length > 0 && (
                    <ul className={styles.list}>
                      {filtered.map((record, index) => (
                        <li key={record.id}>
                          {/* Carbon's ClickableTile without an href is an <a> with no link
                              role, which a screen reader reads as plain text, not as
                              something to open (v1.3.6.59). So it is a button that opens
                              a dialog, named by the title first, then the kind, date and
                              type, then the tags, all text that is on the card. */}
                          <ClickableTile
                              role="button"
                              aria-haspopup="dialog"
                              aria-labelledby={`${tileId}-${index}-title ${tileId}-${index}-meta ${tileId}-${index}-tags`}
                              onClick={(event) => {
                                returnFocusTo.current = event.currentTarget;
                                setSelectedId(record.id);
                              }}
                              className={`${styles.tile} ${styles[record.kind] ?? ''}`}
                          >
                            <div id={`${tileId}-${index}-meta`} className={styles.meta}>
                              <RecordKindTag kind={record.kind} />
                              <span>{record.date} · {highlightMatch(record.type, searchQuery)}</span>
                            </div>
                            <h2 id={`${tileId}-${index}-title`} className={styles.title}>{highlightMatch(record.title, searchQuery)}</h2>
                            <div id={`${tileId}-${index}-tags`} className={styles.tags}>
                              {record.tags.map((tag) => (
                                <Tag key={tag} type="gray" size="sm">{tag}</Tag>
                              ))}
                            </div>
                          </ClickableTile>
                        </li>
                      ))}
                    </ul>
                  )}
                </Layer>
              </section>
            </Column>
          </Grid>
        </Column>
      </Grid>

      {showCreateForm && (
          <Modal
              open
              modalHeading="New research session"
              passiveModal
              // Focus starts on the Title field, the first thing to fill in,
              // rather than on Close (v1.3.6.64).
              selectorPrimaryFocus="#title"
              onRequestClose={() => setShowCreateForm(false)}
              onKeyDownCapture={closeOnEscapeFromCloseButton(() => setShowCreateForm(false))}
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
