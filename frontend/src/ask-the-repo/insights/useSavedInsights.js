import { useCallback, useMemo, useState } from 'react';

// `{ month: 'short', day: 'numeric', year: 'numeric' }` — "Sep 27, 2026",
// the same format POST /api/ask's sources use for `date`.
function today() {
    return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Builds a saved insight from a cited source — the reference's
 * `SourceDetailModal.tsx` `handleSaveInsight` shape (`../../docs/…/types/
 * insight.ts`'s `Insight`), plus `sourceId`/`sourceKind` so the rail can
 * tell which sources are saved and the card can show the source's
 * KindTag.
 *
 * `project` is the source's `recordProject`: the cited record's own
 * project-* tag, which is what the Saved Insights tab groups by. (Not
 * `source.project`, which only echoes the question's filter and is null
 * for every source of an unfiltered question.) A record with no project,
 * or one the config's project list doesn't know, lands in the tab's
 * "Other" group.
 */
export function insightFromSource(source) {
    return {
        id: `ins-${source.id}`,
        title: source.title,
        content: source.excerpt,
        project: source.recordProject ?? null,
        date: today(),
        savedFrom: 'source',
        sourceId: source.id,
        sourceKind: source.kind,
    };
}

/**
 * Splits insights into one group per real project (in `projects` order,
 * empty groups dropped) plus an `ungrouped` list for anything whose
 * `project` matches none of them — the reference `SavedInsightsView.tsx`'s
 * `grouped`/`ungrouped` split. One deliberate difference: the `all`
 * pseudo-project ("All Projects", the project switcher's no-filter option)
 * never becomes a group of its own, since it isn't a project an insight
 * can belong to; an insight tagged `all` is ungrouped.
 */
export function groupInsightsByProject(insights, projects) {
    const realProjects = projects.filter((project) => project.id !== 'all');
    const groups = realProjects
        .map((project) => ({ project, items: insights.filter((insight) => insight.project === project.id) }))
        .filter((group) => group.items.length > 0);
    const ungrouped = insights.filter(
        (insight) => !realProjects.some((project) => project.id === insight.project)
    );
    return { groups, ungrouped };
}

/**
 * Session-only store of saved insights for Ask the Repo, lifted to
 * `AskTheRepo.jsx` (Story 6) because two siblings now share it: the
 * sources rail writes to it ("Save as insight" in `SourceDetailModal`) and
 * the Saved Insights tab reads and removes from it — the same reason
 * Story 3 lifted the active conversation and Story 5 lifted the message
 * store. Before this, "saved" was a `Set` local to `SourcesPanel` that
 * nothing else could read; that `Set` is gone, not duplicated —
 * `savedSourceIds` is derived from `insights`, so the rail's toggle and
 * the tab's Remove can never disagree.
 *
 * Nothing here persists: insights live in React state until the page
 * unmounts. Real persistence (writing insights back as repo records) is
 * v1.3.7, and the UI says so where insights are saved and shown.
 */
export function useSavedInsights(initialInsights = []) {
    const [insights, setInsights] = useState(initialInsights);

    const savedSourceIds = useMemo(
        () => new Set(insights.filter((insight) => insight.sourceId).map((insight) => insight.sourceId)),
        [insights]
    );

    // Toggle, not add-only: the modal's "Save as insight" button is a
    // pressed/unpressed toggle (Story 5), so pressing it again un-saves.
    // Newest first, matching the reference's `saveInsight`.
    const toggleSourceInsight = useCallback((source) => {
        setInsights((prev) =>
            prev.some((insight) => insight.sourceId === source.id)
                ? prev.filter((insight) => insight.sourceId !== source.id)
                : [insightFromSource(source), ...prev]
        );
    }, []);

    const removeInsight = useCallback((insightId) => {
        setInsights((prev) => prev.filter((insight) => insight.id !== insightId));
    }, []);

    return { insights, savedSourceIds, toggleSourceInsight, removeInsight };
}
