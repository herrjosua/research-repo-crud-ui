import { Grid, Column, InlineNotification } from '@carbon/react';
import { Bookmark } from '@carbon/icons-react';
import InsightCard from './InsightCard';
import { groupInsightsByProject } from './useSavedInsights';
import styles from './SavedInsightsView.module.scss';

function countLabel(count) {
    return `${count} insight${count === 1 ? '' : 's'}`;
}

function InsightGroup({ label, items, onRemove }) {
    return (
        <section className={styles.group} aria-label={label}>
            <div className={styles.groupHeader}>
                <h3 className={styles.groupLabel}>{label}</h3>
                <span className={styles.rule} aria-hidden="true" />
                <span className={styles.groupCount}>{countLabel(items.length)}</span>
            </div>
            <ul className={styles.list}>
                {items.map((insight) => (
                    <li key={insight.id}>
                        <InsightCard insight={insight} onRemove={() => onRemove(insight.id)} />
                    </li>
                ))}
            </ul>
        </section>
    );
}

/**
 * The "Saved Insights" tab: every insight saved this session, grouped by
 * project (one section per project that has any, in `projects` order),
 * then an "Other" section for insights whose project matches none of them
 * — see `groupInsightsByProject` in `./useSavedInsights.js`. Reimplements
 * the Direction B v2 reference's `SavedInsightsView.tsx` on Carbon/SCSS,
 * minus its "Back to conversations" button (the Ask / Saved Insights tabs
 * right above this already do that).
 *
 * Insights are session-only until v1.3.7, so a `lowContrast` info
 * notification — the same boundary pattern as the source detail modal and
 * `RecordDetail.jsx` — says plainly that nothing here is saved to the repo
 * yet, and the empty state says where insights come from.
 *
 * `insights` (from `useSavedInsights`, lifted to `AskTheRepo.jsx`),
 * `projects` (GET /api/ask/config's `{ id, label }` list; see
 * `../fixtures/constants.js`), `onRemove(id)`.
 */
export default function SavedInsightsView({ insights, projects, onRemove }) {
    const { groups, ungrouped } = groupInsightsByProject(insights, projects);

    return (
        // The narrow Grid *is* the scroll container (`styles.view`), not a
        // child of one: `narrow` hangs the Grid 16px into the gutter
        // (negative margin) so its content lines up with the breadcrumb and
        // tab bar above, and a separate scroll wrapper around it clipped
        // that hanging 16px off the left edge.
        <Grid narrow className={styles.view}>
            <Column sm={4} md={8} lg={12}>
                <div className={styles.header}>
                    <h2 className={styles.heading}>Saved insights</h2>
                    {insights.length > 0 && <span className={styles.total}>{countLabel(insights.length)}</span>}
                </div>
                <InlineNotification
                    kind="info"
                    title="Session only"
                    subtitle="Insights aren't saved to the repo yet — they stay here until you leave this page."
                    lowContrast
                    hideCloseButton
                    className={styles.notice}
                />

                {insights.length === 0 ? (
                    <div className={styles.empty}>
                        <Bookmark size={32} aria-hidden="true" className={styles.emptyIcon} />
                        <p className={styles.emptyTitle}>No saved insights yet</p>
                        <p className={styles.emptyBody}>
                            Open a cited source in the Ask tab and choose “Save as insight” to collect it here.
                        </p>
                    </div>
                ) : (
                    <div className={styles.groups}>
                        {groups.map(({ project, items }) => (
                            <InsightGroup key={project.id} label={project.label} items={items} onRemove={onRemove} />
                        ))}
                        {ungrouped.length > 0 && (
                            <InsightGroup label="Other" items={ungrouped} onRemove={onRemove} />
                        )}
                    </div>
                )}
            </Column>
        </Grid>
    );
}
