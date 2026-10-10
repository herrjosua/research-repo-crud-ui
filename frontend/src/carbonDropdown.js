// Carbon's Dropdown (@carbon/react 1.x, ListBoxMenuIcon) labels its chevron
// "Open menu" / "Close menu". The chevron sits inside the combobox button,
// which already announces its own name and expanded state, so screen readers
// read "Open menu" as a duplicate, misleading part of the field's name.
// Returning an empty string makes Carbon's icon decorative (aria-hidden).
// This is the one place that works around it: revisit when upgrading Carbon.
export const hideMenuIconLabel = () => '';
