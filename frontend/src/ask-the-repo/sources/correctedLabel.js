/**
 * "Corrected Sep 27, 2026" for a correction's "YYYY-MM-DD" date, in the
 * Ask tab's date format (as `source.date`), in UTC so the date doesn't
 * shift with the viewer's time zone. null for anything else.
 */
export function correctedLabel(correction) {
    const date = new Date(correction?.date);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(correction?.date || '') || Number.isNaN(date.getTime())) return null;
    return `Corrected ${date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
}
