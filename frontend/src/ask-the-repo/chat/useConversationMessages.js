import { useCallback, useState } from 'react';
import { INITIAL_MESSAGES_BY_CONVERSATION } from '../mock/messages';

// Bucket key for "no conversation selected yet" — mirrors AskView.tsx's
// own per-conversation `Record<string, Message[]>` (`convMessages`), just
// with an explicit string instead of `null` so a plain object works as
// the lookup table without a special-cased branch for the empty case.
const DRAFT_KEY = '__draft__';

/**
 * Per-conversation message store for Ask the Repo. Lived inside
 * `ChatPanel` as local state through Story 4, when nothing outside the
 * panel needed to read it; lifted here in Story 5 because the sources
 * rail (`../sources/SourcesPanel.jsx`) now needs the active conversation's
 * messages too — the same reason Story 3 lifted `activeConversationId`
 * into `AskTheRepo.jsx`. A hook rather than inline state in AskTheRepo so
 * ChatPanel's own tests/stories can mount it standalone with the same
 * store the real page uses.
 *
 * Story 8 swaps the seeded `INITIAL_MESSAGES_BY_CONVERSATION` for a fetch
 * keyed by conversation id; `getMessages`/`appendMessage` stay the
 * interface either way.
 */
export function useConversationMessages() {
    const [messagesByKey, setMessagesByKey] = useState(INITIAL_MESSAGES_BY_CONVERSATION);

    const getMessages = useCallback(
        (conversationId) => messagesByKey[conversationId ?? DRAFT_KEY] ?? [],
        [messagesByKey]
    );

    // Takes the conversation id explicitly (rather than closing over the
    // currently-active one) so a reply that lands after the user has
    // switched conversations still goes to the conversation it was asked
    // in — same guarantee ChatPanel's own `key` capture gave before.
    const appendMessage = useCallback((conversationId, message) => {
        const key = conversationId ?? DRAFT_KEY;
        setMessagesByKey((prev) => ({ ...prev, [key]: [...(prev[key] ?? []), message] }));
    }, []);

    return { getMessages, appendMessage };
}

/**
 * The assistant message whose sources the right rail shows: the latest
 * one in the conversation, matching AskView.tsx's `activeSources` (reset
 * to the last assistant message's sources on conversation select, and to
 * each new reply's sources as it lands). `null` when the conversation has
 * no assistant reply yet.
 */
export function latestAssistantMessage(messages) {
    return messages.findLast((message) => message.role === 'assistant') ?? null;
}
