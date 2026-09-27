import { act, renderHook } from '@testing-library/react';
import { useSavedInsights, groupInsightsByProject, insightFromSource } from './useSavedInsights';
import { PROJECTS } from '../mock/constants';
import { SAMPLE_INSIGHTS } from '../mock/insights';
import { INITIAL_MESSAGES_BY_CONVERSATION } from '../mock/messages';

const [interview, survey] = INITIAL_MESSAGES_BY_CONVERSATION.c1[1].sources;

describe('insightFromSource', () => {
    it('resolves the source\'s project label to its PROJECTS id', () => {
        expect(insightFromSource(interview)).toMatchObject({
            id: `ins-${interview.id}`,
            title: interview.title,
            content: interview.excerpt,
            project: 'checkout',
            savedFrom: 'source',
            sourceId: interview.id,
            sourceKind: 'interview',
        });
    });

    it('keeps an unmatched project label as-is, so it lands ungrouped', () => {
        expect(insightFromSource({ ...interview, project: 'Nowhere' }).project).toBe('Nowhere');
    });
});

describe('groupInsightsByProject', () => {
    it('groups by project in PROJECTS order and buckets unmatched projects as ungrouped', () => {
        const { groups, ungrouped } = groupInsightsByProject(SAMPLE_INSIGHTS, PROJECTS);

        expect(groups.map((group) => group.project.id)).toEqual(['checkout', 'onboarding']);
        expect(groups[0].items.map((insight) => insight.id)).toEqual(['ins-s1', 'ins-s4']);
        expect(ungrouped.map((insight) => insight.id)).toEqual(['ins-x1']);
    });

    it('treats the "all" pseudo-project as ungrouped, not a group of its own', () => {
        const { groups, ungrouped } = groupInsightsByProject([{ ...SAMPLE_INSIGHTS[0], project: 'all' }], PROJECTS);

        expect(groups).toEqual([]);
        expect(ungrouped).toHaveLength(1);
    });
});

describe('useSavedInsights', () => {
    it('saves a source newest-first and marks it saved', () => {
        const { result } = renderHook(() => useSavedInsights());

        act(() => result.current.toggleSourceInsight(interview));
        act(() => result.current.toggleSourceInsight(survey));

        expect(result.current.insights.map((insight) => insight.sourceId)).toEqual([survey.id, interview.id]);
        expect(result.current.savedSourceIds.has(interview.id)).toBe(true);
    });

    it('un-saves on a second toggle of the same source', () => {
        const { result } = renderHook(() => useSavedInsights());

        act(() => result.current.toggleSourceInsight(interview));
        act(() => result.current.toggleSourceInsight(interview));

        expect(result.current.insights).toEqual([]);
        expect(result.current.savedSourceIds.has(interview.id)).toBe(false);
    });

    it('removing an insight also clears its source\'s saved state', () => {
        const { result } = renderHook(() => useSavedInsights());

        act(() => result.current.toggleSourceInsight(interview));
        act(() => result.current.removeInsight(`ins-${interview.id}`));

        expect(result.current.insights).toEqual([]);
        expect(result.current.savedSourceIds.has(interview.id)).toBe(false);
    });
});
