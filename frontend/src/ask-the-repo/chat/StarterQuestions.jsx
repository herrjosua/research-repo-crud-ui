import styles from './StarterQuestions.module.scss';

/**
 * Suggested-question list shown in place of the message list when a
 * conversation has no messages yet (see `ChatPanel.jsx`). Reimplements
 * `docs/Build_Direction_B_v2_Design_decomposed`'s `AskView.tsx` starter
 * buttons, but deliberately changes the interaction: the reference sends
 * the question immediately on click; here, clicking one only fills the
 * composer (`onSelect`) so the user can review or edit it before sending.
 *
 * `questions`: question strings (live mode, from `./starters.js`'s
 * `startersFor(projectId)`), or `{ id, question }` items (static mode).
 * `onSelect(question)` gets the clicked entry itself, string or item, so
 * a static question is identified by its id, never by matching its text
 * (two captured questions may share wording). `label`: the heading above
 * the list. In static mode (the public demo) the same list is the
 * question picker: `label` says so, and ChatPanel sends the picked
 * question straight away, since there's no composer to fill. There's no disabled
 * state: ChatPanel doesn't render the starters when asking isn't
 * available, and a conversation that's waiting on an answer already has
 * its question in the thread, so the starters aren't showing then either.
 */
export default function StarterQuestions({ questions, onSelect, label = 'Try asking' }) {
    return (
        <div className={styles.wrapper}>
            <p className={styles.label}>{label}</p>
            <div className={styles.list}>
                {questions.map((question) => {
                    const isItem = typeof question !== 'string';
                    return (
                        <button
                            key={isItem ? question.id : question}
                            type="button"
                            className={styles.question}
                            onClick={() => onSelect(question)}
                        >
                            {isItem ? question.question : question}
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
