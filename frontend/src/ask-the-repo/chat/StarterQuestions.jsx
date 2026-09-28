import styles from './StarterQuestions.module.scss';

/**
 * Suggested-question list shown in place of the message list when a
 * conversation has no messages yet (see `ChatPanel.jsx`). Reimplements
 * `docs/Build_Direction_B_v2_Design_decomposed`'s `AskView.tsx` starter
 * buttons, but deliberately changes the interaction: the reference sends
 * the question immediately on click; here, clicking one only fills the
 * composer (`onSelect`) so the user can review or edit it before sending.
 *
 * `questions` (array of question strings, from `./starters.js`'s
 * `startersFor(projectId)`), `onSelect(question)`, `disabled` (bool — while
 * a question is being answered, or when asking isn't available).
 */
export default function StarterQuestions({ questions, onSelect, disabled = false }) {
    return (
        <div className={styles.wrapper}>
            <p className={styles.label}>Try asking</p>
            <div className={styles.list}>
                {questions.map((question) => (
                    <button
                        key={question}
                        type="button"
                        className={styles.question}
                        disabled={disabled}
                        onClick={() => onSelect(question)}
                    >
                        {question}
                    </button>
                ))}
            </div>
        </div>
    );
}
