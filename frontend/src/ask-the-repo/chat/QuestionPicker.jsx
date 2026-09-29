import { useId } from 'react';
import { Dropdown } from '@carbon/react';
import { PICKER_LABEL } from './askCopy';
import styles from './QuestionPicker.module.scss';

/**
 * Static mode's (the public demo's) stand-in for the Composer, pinned in
 * the same row below the thread once a conversation has started: a Carbon
 * Dropdown of the captured questions. Picking a question asks it (`onPick(question)`)
 * straight away; the field then shows its placeholder again, so any
 * question, the same one included, can be picked next.
 *
 * `questions` (`[{ id, question, project }]`, already filtered to the
 * active project), `disabled` (an answer is on its way), `onPick(question)`.
 */
export default function QuestionPicker({ questions, disabled = false, onPick }) {
    // Unique per instance: autodocs renders several stories on one page.
    const id = useId();

    return (
        <div className={styles.picker}>
            <Dropdown
                id={id}
                titleText={PICKER_LABEL}
                hideLabel
                label={PICKER_LABEL}
                items={questions}
                // Controlled and always empty: a pick is an action, not a
                // setting, so nothing stays selected.
                selectedItem={null}
                itemToString={(question) => question?.question ?? ''}
                // The row sits at the bottom of the panel; opening upward
                // keeps the list over the thread instead of off the page.
                direction="top"
                disabled={disabled}
                onChange={({ selectedItem }) => {
                    if (selectedItem) onPick(selectedItem);
                }}
            />
        </div>
    );
}
