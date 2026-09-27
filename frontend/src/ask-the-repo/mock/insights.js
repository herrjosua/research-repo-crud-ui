// Story/test fixtures for the Saved Insights tab — the real tab starts
// empty (same as the reference's `useState<Insight[]>([])`) and fills only
// from "Save as insight" in the sources rail. Shaped like
// `../insights/useSavedInsights.js`'s `insightFromSource` output, covering
// the cases the tab has to render: two real projects, an insight with no
// matching project (the "Other" bucket), and one long enough to collapse
// (over InsightCard's 180-character preview).
export const SAMPLE_INSIGHTS = [
    {
        id: 'ins-s1',
        title: 'Checkout Usability Study — Wave 2',
        content: 'I kept hitting the address form and giving up.',
        project: 'checkout',
        date: 'Sep 27, 2026',
        savedFrom: 'source',
        sourceId: 's1',
        sourceKind: 'interview',
    },
    {
        id: 'ins-s4',
        title: 'Q3 Checkout Research Synthesis',
        content: 'Forced registration is a well-documented conversion killer. Across the Wave 2 usability study, the Q3 post-purchase survey, and funnel analytics, the registration gate before checkout accounted for a 41% drop-off among first-time visitors — the single largest abandonment point in the funnel.',
        project: 'checkout',
        date: 'Sep 27, 2026',
        savedFrom: 'source',
        sourceId: 's4',
        sourceKind: 'synthesis',
    },
    {
        id: 'ins-o1',
        title: 'Onboarding Diary Study — Week 1',
        content: 'Nobody told me the workspace invite had expired, so I just assumed the product was broken.',
        project: 'onboarding',
        date: 'Sep 26, 2026',
        savedFrom: 'source',
        sourceId: 'o1',
        sourceKind: 'transcript',
    },
    {
        id: 'ins-x1',
        title: 'Competitive Teardown — Payments',
        content: 'Four of five competitors offer a wallet button above the fold on the payment step.',
        project: 'Payments Benchmark',
        date: 'Sep 25, 2026',
        savedFrom: 'source',
        sourceId: 'x1',
        sourceKind: 'doc',
    },
];
