import { Accordion, AccordionItem, Button, Checkbox, Search, Tag } from '@carbon/react';
import { Add } from '@carbon/icons-react';
import { RECORD_KINDS } from './recordKinds';
import styles from './RecordsRail.module.scss';

/**
 * Left rail of the Research Records page: "New session", record search, and
 * the Kind and Tags filters as collapsible sections — Direction B v2's
 * records rail (docs/Build_Direction_B_v2_Design_decomposed's
 * `RecordsView.tsx`), rebuilt on the shell Ask the Repo's `LeftRail` already
 * ships: the same `$background` surface, `$border-subtle` edge and
 * section-label type, sized by its Grid Column rather than the reference's
 * fixed 280px. No collapse toggle, unlike `LeftRail`: the filters are the
 * rail's whole job, and the reference has none.
 *
 * Presentational only — Dashboard.jsx owns every piece of filter state and
 * passes it down, so filtering behaves exactly as it did before the rail
 * was split out.
 *
 * `onNewSession()`: opens the New session modal.
 * `searchQuery` / `onSearchChange(query)`: the record search.
 * `activeKinds` (Set of kind ids) / `onToggleKind(id)`.
 * `tags` (the tag names to list, already narrowed by `tagQuery`) /
 * `activeTags` (Set) / `onToggleTag(tag)`.
 * `tagQuery` / `onTagQueryChange(query)`: the tag list's own filter.
 */
export default function RecordsRail({
    onNewSession,
    searchQuery,
    onSearchChange,
    activeKinds,
    onToggleKind,
    tags,
    activeTags,
    onToggleTag,
    tagQuery,
    onTagQueryChange,
}) {
    const selectedTagCount = activeTags.size;

    return (
        <aside className={styles.rail} aria-label="Record filters">
            <div className={styles.newSession}>
                <Button kind="primary" size="md" renderIcon={Add} onClick={() => onNewSession()}>
                    New session
                </Button>
            </div>
            <div className={styles.search}>
                <Search
                    size="md"
                    labelText="Search records"
                    placeholder="Search records"
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    onClear={() => onSearchChange('')}
                />
            </div>
            <Accordion className={styles.sections} size="md">
                <AccordionItem open title={<span className={styles.sectionLabel}>Kind</span>}>
                    <fieldset className={styles.fieldset}>
                        <legend className="cds--visually-hidden">Kind</legend>
                        {RECORD_KINDS.map((kind) => (
                            <Checkbox
                                key={kind.id}
                                id={`kind-${kind.id}`}
                                labelText={(
                                    <span className={styles.kindLabel}>
                                        <span className={`${styles.swatch} ${styles[kind.id]}`} aria-hidden="true" />
                                        {kind.label}
                                    </span>
                                )}
                                checked={activeKinds.has(kind.id)}
                                onChange={() => onToggleKind(kind.id)}
                            />
                        ))}
                    </fieldset>
                </AccordionItem>
                <AccordionItem
                    open
                    title={(
                        <span className={styles.sectionTitle}>
                            <span className={styles.sectionLabel}>Tags</span>
                            {selectedTagCount > 0 && (
                                // A span, not Tag's default div: it sits inside the
                                // Accordion heading's <button>.
                                <Tag as="span" type="teal" size="sm" className={styles.count}>
                                    {selectedTagCount}
                                    <span className="cds--visually-hidden"> selected</span>
                                </Tag>
                            )}
                        </span>
                    )}
                >
                    {/* The legend keeps the count in words for anyone
                        reaching the group directly (e.g. a screen reader's
                        form-control list), not only via the heading. */}
                    <fieldset className={styles.fieldset}>
                        <legend className="cds--visually-hidden">
                            Tags{selectedTagCount > 0 && ` (${selectedTagCount} selected)`}
                        </legend>
                        <Search
                            size="sm"
                            labelText="Filter tags"
                            placeholder="Filter tags"
                            value={tagQuery}
                            onChange={(e) => onTagQueryChange(e.target.value)}
                            onClear={() => onTagQueryChange('')}
                        />
                        <div className={styles.tagList}>
                            {tags.map((tag) => (
                                <Checkbox
                                    key={tag}
                                    id={`tag-${tag}`}
                                    labelText={tag}
                                    checked={activeTags.has(tag)}
                                    onChange={() => onToggleTag(tag)}
                                />
                            ))}
                        </div>
                    </fieldset>
                </AccordionItem>
            </Accordion>
        </aside>
    );
}
