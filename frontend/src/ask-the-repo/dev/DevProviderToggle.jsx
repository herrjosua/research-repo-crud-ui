import { useEffect, useId, useRef, useState } from 'react';
import { Callout, ContentSwitcher, InlineLoading, Switch, Tag } from '@carbon/react';
import { useDevProvider, useSetDevProvider } from '../../api/dev';
import { PROVIDER_OPTIONS, TOGGLE_LABEL } from './devProviderCopy';
import styles from './DevProviderToggle.module.scss';

function optionFor(provider) {
    return PROVIDER_OPTIONS.find((option) => option.provider === provider);
}

/**
 * Dev-only: switches Ask the Repo between the static and live providers on
 * the running backend (POST /api/dev/provider), without a restart.
 * AskTheRepo.jsx only loads this under `import.meta.env.DEV`, and it
 * renders nothing unless GET /api/dev/provider answers, which only a
 * backend started with DEV_TOOLS_ENABLED=true (and NODE_ENV development or
 * test) does.
 *
 * Accessibility:
 * - The ContentSwitcher (a tablist of two tabs) is named by `aria-label`
 *   (TOGGLE_LABEL). With nothing active yet (LLM_PROVIDER unset), the
 *   first tab stays in the tab order, since Carbon only makes the
 *   selected one tabbable.
 * - Manual selection: arrow keys move focus between the tabs, Enter or
 *   Space switches. Every switch is a request to the server, so arrowing
 *   past an option mustn't trigger one.
 * - The result of a switch, success or error, is announced once, through
 *   the one polite status region below. The pending spinner and the error
 *   Callout are not live regions, so nothing else announces it.
 * - While a switch is in flight, the other option is disabled.
 * - On an error the selection goes back to the provider still active, and
 *   so does focus, with the error shown in a Callout until the next switch
 *   or Dismiss.
 *
 * `onSwitched(provider)`: called after the server has switched, so the Ask
 * page can clear its conversations (see AskTheRepo.jsx).
 *
 * Carbon-version dependencies (checked against @carbon/react 1.116; the
 * unit tests cover each, so an upgrade that changes one fails there):
 * ContentSwitcher keeps its own selected index and only re-syncs it when
 * the `selectedIndex` prop changes; it passes `aria-label` through to its
 * tablist; and Switch spreads extra props after its own `tabIndex`, which
 * is how the first tab stays tabbable with nothing selected.
 */
export default function DevProviderToggle({ onSwitched }) {
    const current = useDevProvider();
    const setProvider = useSetDevProvider();
    const [pending, setPending] = useState(null);
    const [error, setError] = useState(null);
    const [announcement, setAnnouncement] = useState({ text: '', count: 0 });
    // `{ index }` of the tab to focus after the next render; a new object
    // each time, so the same tab can be refocused twice.
    const [refocus, setRefocus] = useState(null);
    const inFlight = useRef(false);
    const wrapperRef = useRef(null);
    const titleId = useId();

    // After a failed switch or Dismiss: focus the active provider's tab.
    // By position, not by which tab is tabbable: Carbon syncs its own
    // selection in an effect that hasn't re-rendered yet when this runs.
    useEffect(() => {
        if (refocus) wrapperRef.current?.querySelectorAll('[role="tab"]')[refocus.index]?.focus();
    }, [refocus]);

    // Pending, or a 404: this backend has no dev tools, so neither does the page.
    if (!current.data) return null;

    const active = current.data.provider;
    const shown = pending ?? active;
    const selectedIndex = PROVIDER_OPTIONS.findIndex((option) => option.provider === shown);

    // The active provider's tab, or the first when none is active.
    const activeIndex = Math.max(0, PROVIDER_OPTIONS.findIndex((option) => option.provider === active));

    function announce(text) {
        setAnnouncement((prev) => ({ text, count: prev.count + 1 }));
    }

    async function handleChange({ index }) {
        const next = PROVIDER_OPTIONS[index]?.provider;
        // Carbon can report one Enter as both a key press and a click.
        if (!next || next === active || inFlight.current) return;
        inFlight.current = true;
        setPending(next);
        setError(null);
        try {
            await setProvider.mutateAsync(next);
            announce(`Switched to ${optionFor(next).spoken}. Conversations were cleared.`);
            onSwitched?.(next);
        } catch (err) {
            const message = err.message || 'The server did not switch.';
            setError(message);
            announce(`Couldn't switch to ${optionFor(next).spoken}. ${message}`);
            setRefocus({ index: activeIndex });
        } finally {
            inFlight.current = false;
            setPending(null);
        }
    }

    function handleDismiss() {
        setError(null);
        setRefocus({ index: activeIndex });
    }

    return (
        <div className={styles.toggle} ref={wrapperRef}>
            <Tag type="purple" size="sm" className={styles.tag}>Dev</Tag>
            <ContentSwitcher
                aria-label={TOGGLE_LABEL}
                size="sm"
                selectionMode="manual"
                selectedIndex={selectedIndex}
                onChange={handleChange}
                className={styles.switcher}
            >
                {PROVIDER_OPTIONS.map((option, index) => (
                    <Switch
                        key={option.provider}
                        name={option.provider}
                        text={option.text}
                        // While a switch is in flight the other option can't
                        // be picked: Carbon would select it even though no
                        // second switch is sent.
                        disabled={pending !== null && option.provider !== pending}
                        {...(selectedIndex === -1 && index === 0 ? { tabIndex: 0 } : {})}
                    />
                ))}
            </ContentSwitcher>
            {pending && (
                <InlineLoading description="Switching…" aria-live="off" className={styles.loading} />
            )}
            {/* The one announcement per switch. A trailing no-break space on
                every other one, so the same text twice in a row is read again. */}
            <p className="cds--visually-hidden" role="status" aria-live="polite">
                {announcement.text + (announcement.count % 2 ? ' ' : '')}
            </p>
            {error && (
                <Callout
                    kind="error"
                    lowContrast
                    title="Provider not switched"
                    titleId={titleId}
                    subtitle={error}
                    actionButtonLabel="Dismiss"
                    onActionButtonClick={handleDismiss}
                    className={styles.error}
                />
            )}
        </div>
    );
}
