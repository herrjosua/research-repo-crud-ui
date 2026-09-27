// Reduces whatever the model returns to plain text before it leaves the
// server. The prompt asks for plain text, but a model's output is untrusted:
// it can still emit markdown, raw HTML, or text copied out of a record. The
// frontend renders answers as React text (never innerHTML), so this is
// defence in depth plus consistency — the answer reads the same in any
// client, and nothing downstream has to decide what markup is safe.
//
// Kept on purpose: paragraph breaks (blank lines), "- " bullets, "1. " lists,
// and [n] citation markers. Everything else is unwrapped to its text.

function toPlainText(raw) {
    let text = String(raw ?? '')
        .replace(/\r\n?/g, '\n')
        // Control characters other than tab and newline.
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        // HTML: drop script/style blocks with their contents and comments,
        // turn line-breaking tags into newlines, then drop every other tag.
        .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(p|div|li|h[1-6])\s*>/gi, '\n')
        .replace(/<\/?[a-z][^>]*>/gi, '')
        // Fenced code: keep the code, drop the fence lines.
        .replace(/^\s*(```|~~~).*$/gm, '')
        // Images and links: keep the visible text, drop the URL. Citation
        // markers like [2] are never followed by "(", so they survive.
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        // Block syntax at line start.
        .replace(/^\s{0,3}#{1,6}\s+/gm, '')
        .replace(/^\s{0,3}>\s?/gm, '')
        .replace(/^\s*([-*_])(\s*\1){2,}\s*$/gm, '')
        .replace(/^(\s*)[*+]\s+/gm, '$1- ')
        // Inline emphasis and code.
        .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
        .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?![\w*])/g, '$1$2')
        .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, '$1$2')
        .replace(/`([^`\n]*)`/g, '$1');

    text = text
        .split('\n')
        .map((line) => line.replace(/[ \t]+$/, ''))
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    return text;
}

module.exports = { toPlainText };
