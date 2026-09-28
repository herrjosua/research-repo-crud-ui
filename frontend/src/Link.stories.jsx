import { Link } from '@carbon/react';
import styles from './Link.stories.module.scss';

// The one place to review the app's link theming — teal via
// styles/_carbon-tokens.scss (`link-*` tokens; see
// ask-the-repo/TOKEN_MAPPING.md "Links"). Every kind of link the app
// renders, in every state, on every surface it sits on:
//
// - Carbon link styling (`cds--link`): breadcrumb crumbs, and Carbon's
//   `Link` wherever it's used.
// - A plain <a> inside body text: record bodies (RecordDetail's rendered
//   HTML) and CKEditor content take Carbon's global `a` color only.
//
// Surfaces: the page (`$background`), a modal (`$layer-01`, where record
// bodies render) and CKEditor's editing area, which stays white even in
// g100 — the case styles/_ckeditor.scss re-points to the inverse link
// pair. The last is a stand-in (a white `.ck-content` block), not a live
// editor, so the override's own selector is what's being shown.
//
// Hover/focus/active are forced with storybook-addon-pseudo-states, like
// Shared/Core/Button, so Chromatic snapshots each one.
const STATES = ['default', 'hover', 'focus', 'active'];
const FORCED = ['hover', 'focus', 'active'];

// `kinds`: the links that really render on that surface — only content
// links (plain <a>) ever appear inside CKEditor's editing area.
const SURFACES = [
  { id: 'page', label: 'On the page ($background)', className: styles.page, kinds: ['carbon', 'inline'] },
  { id: 'layer', label: 'In a modal — record body ($layer-01)', className: styles.layer, kinds: ['carbon', 'inline'] },
  { id: 'editor', label: 'CKEditor editing area (white in both themes)', className: `ck-content ${styles.editor}`, kinds: ['inline'] },
];

const cellId = (surface, kind, state) => `link-${surface}-${kind}-${state}`;

const pseudo = Object.fromEntries(
  FORCED.map((state) => [
    state,
    SURFACES.flatMap((surface) => surface.kinds.map((kind) => `#${cellId(surface.id, kind, state)}`)),
  ]),
);

function Matrix({ surface }) {
  return (
    <section className={surface.className} aria-labelledby={`${surface.id}-links`}>
      <h2 id={`${surface.id}-links`} className={styles.heading}>{surface.label}</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Link</th>
            {STATES.map((state) => <th key={state} scope="col">{state}</th>)}
          </tr>
        </thead>
        <tbody>
          {surface.kinds.includes('carbon') && (
          <tr>
            <th scope="row">Carbon <code>Link</code> / breadcrumb</th>
            {STATES.map((state) => (
              <td key={state}>
                <Link id={cellId(surface.id, 'carbon', state)} href="#">Research Repo</Link>
              </td>
            ))}
          </tr>
          )}
          <tr>
            <th scope="row">Plain <code>&lt;a&gt;</code> in body text</th>
            {STATES.map((state) => (
              <td key={state}>
                <p>See <a id={cellId(surface.id, 'inline', state)} href="#">governance-and-phi.md</a>.</p>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </section>
  );
}

export default {
  title: 'Shared/Core/Link',
  component: Link,
  parameters: { layout: 'fullscreen', pseudo },
  render: () => (
    <div className={styles.stack}>
      {SURFACES.map((surface) => <Matrix key={surface.id} surface={surface} />)}
    </div>
  ),
};

export const AllLinksAndStates = {};

export const AllLinksAndStatesDark = {
  globals: { theme: 'g100' },
};
