import { Button, IconButton } from '@carbon/react';
import { Send } from '@carbon/icons-react';
import styles from './Button.stories.module.scss';

// The one place to review the app's button theming (styles/_carbon-tokens.scss:
// the teal primary and tertiary buttons and the teal focus ring — see
// ask-the-repo/TOKEN_MAPPING.md "Primary and tertiary buttons" / "Focus
// ring" / "Links"). Ghost buttons are teal through the link tokens — a
// ghost label *is* Carbon's link color. Carbon's
// own <Button>, not a wrapper: grouped under Shared/Core like DemoDisclaimer
// because every feature renders it.
//
// Only the kinds this app actually renders, and where:
const KINDS = [
    { kind: 'primary', usedBy: 'Log in, New session, Create session, Save changes, Record detail — Edit' },
    { kind: 'secondary', usedBy: 'Delete confirm dialog — Cancel' },
    { kind: 'tertiary', usedBy: 'New session — Cancel; View history; Try again; source modal actions' },
    { kind: 'ghost', usedBy: 'New chat, insight card actions' },
    { kind: 'danger', usedBy: 'Delete confirm dialog — Delete' },
    { kind: 'danger--tertiary', usedBy: 'Record detail — Delete' },
];

// Hover/focus/active are forced per button with storybook-addon-pseudo-states
// (it rewrites Carbon's `:hover`/`:focus`/`:active` rules to classes), so
// Chromatic snapshots every state, not only the resting one.
const STATES = ['default', 'hover', 'focus', 'active', 'disabled'];
const FORCED = ['hover', 'focus', 'active'];

// Every real surface a button sits on: the page itself (`$background`) and
// a modal/panel (`$layer-01`) — focus-ring contrast differs between them.
const SURFACES = [
    { id: 'page', label: 'On the page ($background)', className: styles.page },
    { id: 'layer', label: 'In a modal or panel ($layer-01)', className: styles.layer },
];

const cellId = (surface, kind, state) => `btn-${surface}-${kind}-${state}`;

const pseudo = Object.fromEntries(
    FORCED.map((state) => [
        state,
        SURFACES.flatMap((surface) => [
            ...KINDS.map(({ kind }) => `#${cellId(surface.id, kind, state)}`),
            `#${cellId(surface.id, 'icon', state)}`,
        ]),
    ]),
);

function Matrix({ surface }) {
    return (
        <section className={surface.className} aria-labelledby={`${surface.id}-heading`}>
            <h2 id={`${surface.id}-heading`} className={styles.heading}>{surface.label}</h2>
            <table className={styles.table}>
                <thead>
                    <tr>
                        <th scope="col">Kind</th>
                        {STATES.map((state) => <th key={state} scope="col">{state}</th>)}
                    </tr>
                </thead>
                <tbody>
                    {KINDS.map(({ kind, usedBy }) => (
                        <tr key={kind}>
                            <th scope="row">
                                <code>{kind}</code>
                                <span className={styles.usedBy}>{usedBy}</span>
                            </th>
                            {STATES.map((state) => (
                                <td key={state}>
                                    <Button
                                        id={cellId(surface.id, kind, state)}
                                        kind={kind}
                                        size="md"
                                        disabled={state === 'disabled'}
                                    >
                                        Button
                                    </Button>
                                </td>
                            ))}
                        </tr>
                    ))}
                    <tr>
                        <th scope="row">
                            <code>primary</code> icon only
                            <span className={styles.usedBy}>Ask the Repo composer — Send</span>
                        </th>
                        {STATES.map((state) => (
                            <td key={state}>
                                <IconButton
                                    id={cellId(surface.id, 'icon', state)}
                                    kind="primary"
                                    label="Send"
                                    disabled={state === 'disabled'}
                                >
                                    <Send />
                                </IconButton>
                            </td>
                        ))}
                    </tr>
                </tbody>
            </table>
        </section>
    );
}

export default {
    title: 'Shared/Core/Button',
    component: Button,
    parameters: { layout: 'fullscreen', pseudo },
    render: () => (
        <div className={styles.stack}>
            {SURFACES.map((surface) => <Matrix key={surface.id} surface={surface} />)}
        </div>
    ),
};

export const AllKindsAndStates = {};

export const AllKindsAndStatesDark = {
    globals: { theme: 'g100' },
};
