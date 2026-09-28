import { ClickableTile, Layer } from '@carbon/react';
import RecordKindTag from './RecordKindTag';
import { RECORD_KINDS } from './recordKinds';
import styles from './RecordKindTag.stories.module.scss';

// Every record kind, in both real contexts: on the page (`$background`,
// e.g. the record detail modal's label sits on a layer of its own) and on
// a Research Records card (a ClickableTile one Layer up from the content
// surface), with the card's kind-colored stripe — both come from the same
// Carbon tag token, so this is where a kind's badge and stripe get reviewed
// together.
export default {
  title: 'Records/RecordKindTag',
  component: RecordKindTag,
  argTypes: {
    kind: { control: 'select', options: RECORD_KINDS.map((kind) => kind.id) },
  },
  args: { kind: 'raw' },
};

export const Default = {};

function AllKinds() {
  return (
    <div className={styles.stack}>
      <div className={styles.row}>
        {RECORD_KINDS.map((kind) => <RecordKindTag key={kind.id} kind={kind.id} />)}
      </div>
      <div className={styles.surface}>
        <Layer>
          {RECORD_KINDS.map((kind) => (
            <ClickableTile key={kind.id} className={`${styles.card} ${styles[kind.id]}`}>
              <RecordKindTag kind={kind.id} />
              <span className={styles.cardText}>2025-01-14 · interview</span>
            </ClickableTile>
          ))}
        </Layer>
      </div>
    </div>
  );
}

export const AllKindsInContext = { render: () => <AllKinds /> };

export const AllKindsInContextDark = { render: () => <AllKinds />, globals: { theme: 'g100' } };
