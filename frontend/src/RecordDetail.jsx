import { useState, useRef, useEffect } from 'react';
import { Modal, Tag, InlineNotification, Button } from '@carbon/react';
import { useRecord, useDeleteRecord, useRecordHistory } from './api/records';
import EditRecordForm from './EditRecordForm';
import { createPortal } from 'react-dom';
import styles from './RecordDetail.module.scss';

function cleanRecordHtml(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;

  const firstH1 = body.querySelector('h1');
  if (firstH1) {
    firstH1.remove();
  }

  const headingTags = ['h5', 'h4', 'h3', 'h2', 'h1'];
  headingTags.forEach((tag) => {
    const elements = body.querySelectorAll(tag);
    elements.forEach((el) => {
      const level = parseInt(tag[1], 10) + 1;
      const replacement = document.createElement('h' + level);
      replacement.innerHTML = el.innerHTML;
      el.replaceWith(replacement);
    });
  });

  const allHeadings = body.querySelectorAll('h1, h2, h3, h4, h5, h6');
  allHeadings.forEach((h) => {
    if (h.textContent.trim().indexOf('Participants —') === 0) {
      h.textContent = 'Participants';
    }
  });

  const rosterItems = body.querySelectorAll('li');
  rosterItems.forEach((li) => {
    if (li.textContent.indexOf('Full participant roster') !== -1) {
      li.remove();
    }
  });

  const findingItems = body.querySelectorAll('li');
  findingItems.forEach((li) => {
    if (li.textContent.indexOf('TODO — one finding per bullet') !== -1) {
      li.innerHTML = '<span class="placeholder">Not yet filled in</span>';
    }
  });

  const wrappedInstructions = body.querySelectorAll('p');
  wrappedInstructions.forEach((p) => {
    if (p.textContent.trim() === 'and a short theme label in parens.') {
      p.remove();
    }
  });

  const rolesLabels = body.querySelectorAll('p, strong');
  rolesLabels.forEach((el) => {
    if (el.textContent.trim() !== 'Roles:') {
      return;
    }
    const paragraph = el.tagName === 'P' ? el : el.closest('p');
    if (!paragraph) {
      return;
    }
    const nextEl = paragraph.nextElementSibling;
    if (!nextEl || nextEl.tagName !== 'UL') {
      return;
    }
    const items = nextEl.querySelectorAll('li');
    if (items.length === 1 && items[0].textContent.trim() === 'TODO') {
      paragraph.innerHTML = '<strong>Roles:</strong> <span class="placeholder">Not yet filled in</span>';
      nextEl.remove();
    }
  });

  const quotes = body.querySelectorAll('blockquote');
  quotes.forEach((bq) => {
    if (bq.textContent.indexOf('TODO') !== -1) {
      bq.remove();
    }
  });

  const brokenLinks = body.querySelectorAll('a[href="TODO.md"]');
  brokenLinks.forEach((a) => {
    const container = a.closest('li') || a.closest('p') || a;
    container.remove();
  });

  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node = walker.nextNode();
  while (node) {
    textNodes.push(node);
    node = walker.nextNode();
  }
  textNodes.forEach((textNode) => {
    const idx = textNode.nodeValue.indexOf('TODO');
    if (idx === -1) {
      return;
    }
    textNode.nodeValue = textNode.nodeValue.slice(0, idx);
    const span = document.createElement('span');
    span.className = 'placeholder';
    span.textContent = 'Not yet filled in';
    textNode.parentNode.insertBefore(span, textNode.nextSibling);
  });

  const finalHeadings = body.querySelectorAll('h1, h2, h3, h4, h5, h6');
  finalHeadings.forEach((heading) => {
    let sibling = heading.nextElementSibling;
    let hasContent = false;
    while (sibling && /^H[1-6]$/.test(sibling.tagName) === false) {
      if (sibling.textContent.trim().length > 0) {
        hasContent = true;
      }
      sibling = sibling.nextElementSibling;
    }
    if (hasContent === false) {
      heading.remove();
    }
  });

  return body.innerHTML;
}

export default function RecordDetail({ id, onClose, onDeleted }) {
  const record = useRecord(id);
  const [isEditing, setIsEditing] = useState(false);
  const [saveWarning, setSaveWarning] = useState(null);
  const editButtonRef = useRef(null);
  const returnFocusToEdit = useRef(false);
  const deleteRecord = useDeleteRecord();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const history = useRecordHistory(id, showHistory);
  const confirmModalRef = useRef(null);

  useEffect(() => {
    // The confirm dialog is stacked on top of this component's own <Modal>
    // via createPortal, so it lives outside that outer modal's DOM subtree.
    // Carbon's outer Modal has a blur handler that treats ANY focus move
    // out of its own subtree as focus having escaped (it has no notion of
    // a legitimately-stacked portaled modal) and forces focus straight back
    // to its own close button — every single time, not just on a race, so
    // simply re-asserting focus afterward just retriggers the same handler.
    // Intercept the one focusout that fires when focus moves from inside
    // this modal into the confirm dialog, in the capture phase, before
    // Carbon's own (bubble-phase) blur handler ever sees it — letting the
    // confirm dialog's own initial-focus effect land and stick. Registered
    // unconditionally on mount (not keyed on showDeleteConfirm) so it's
    // already active before the confirm dialog's own mount-time focus
    // effect ever runs — React runs a newly-mounted child's effects before
    // its parent's, so a listener registered only once showDeleteConfirm
    // flips true would always attach one render too late to catch it.
    const suppressOuterBlurIntoConfirmDialog = (event) => {
      if (confirmModalRef.current?.contains(event.relatedTarget)) {
        event.stopPropagation();
      }
    };
    document.addEventListener('focusout', suppressOuterBlurIntoConfirmDialog, true);
    return () => document.removeEventListener('focusout', suppressOuterBlurIntoConfirmDialog, true);
  }, []);

  // The edit form unmounts on save, taking focus with it. Put focus back on
  // the Edit button that opened it, now remounted in the record view.
  useEffect(() => {
    if (!isEditing && returnFocusToEdit.current) {
      returnFocusToEdit.current = false;
      editButtonRef.current?.focus();
    }
  }, [isEditing]);

  return (
    <Modal
      open
      modalHeading={record.data ? record.data.title : 'Loading…'}
      passiveModal
      onRequestClose={onClose}
    >
      {record.isLoading && <p>Loading…</p>}

      {record.isError && (
        <InlineNotification
          kind="error"
          title="Failed to load record"
          subtitle={record.error.message}
        />
      )}

      {record.data && !isEditing && (
        <>
          {saveWarning && (
            <InlineNotification
              kind="warning"
              title="Saved, but the index reported issues"
              subtitle={saveWarning}
              lowContrast
              onClose={() => setSaveWarning(null)}
            />
          )}
          <p>{record.data.date}</p>
          <Tag type="gray">{record.data.type}</Tag>
          {record.data.tags.map((tag) => (
            <Tag key={tag} type="blue">{tag}</Tag>
          ))}
          {record.data.read_only && (
            <InlineNotification
              kind="info"
              title="Generated from Figma"
              subtitle="To change this component, edit it in Figma and re-run the token sync."
              lowContrast
              hideCloseButton
            />
          )}
          <div className={styles.actions}>
            {!record.data.read_only && (
              <>
                <Button
                  ref={editButtonRef}
                  kind="tertiary"
                  onClick={() => {
                    setSaveWarning(null);
                    setIsEditing(true);
                  }}
                >
                  Edit
                </Button>
                <Button kind="danger--tertiary" onClick={() => setShowDeleteConfirm(true)}>
                  Delete
                </Button>
              </>
            )}
            <Button kind="ghost" onClick={() => setShowHistory(true)}>
              View history
            </Button>
          </div>
          {record.data.last_edited_by && (
              <p>
                Last edited by {record.data.last_edited_by}
                {record.data.last_edited_at && ` on ${new Date(record.data.last_edited_at).toLocaleString()}`}
              </p>
          )}
          <div dangerouslySetInnerHTML={{ __html: cleanRecordHtml(record.data.html) }} />
        </>
      )}

      {record.data && isEditing && (
        <EditRecordForm
          record={record.data}
          onClose={(warning) => {
            setSaveWarning(warning ?? null);
            returnFocusToEdit.current = true;
            setIsEditing(false);
          }}
        />
      )}

      {showDeleteConfirm && createPortal(
          <Modal
              ref={confirmModalRef}
              open
              danger
              modalHeading="Delete this record?"
              primaryButtonText="Delete"
              secondaryButtonText="Cancel"
              // Same underlying class of bug as the focusout workaround
              // above: this dialog is portaled to document.body, so in real
              // DOM terms it's a SIBLING of the outer modal, not a
              // descendant — but createPortal keeps it a normal child in the
              // REACT tree, and Carbon's Modal implements click-outside-to-
              // close with a plain React `onClick` prop on its own outermost
              // element (`handleOnClick` in Modal.tsx, composed with
              // whatever `onClick` we pass here). React bubbles synthetic
              // events along the REACT tree, not the DOM tree, so any click
              // inside this dialog — including its own Cancel button — would
              // otherwise still reach the outer modal's onClick handler,
              // which does a DOM `.contains()` check against its own
              // container, finds the real click target physically sitting in
              // document.body instead of inside it, concludes the click
              // landed "outside" itself, and closes too.
              // Stop the click from propagating past this dialog's own
              // boundary. This fires after the event has already reached its
              // real target (the Cancel/Delete button's own onClick, or this
              // dialog's own click-outside handler) — Carbon composes our
              // onClick with its own via `composeEventHandlers`, which only
              // short-circuits later handlers in that same composed list on
              // `event.preventDefault()`, not on `stopPropagation()` — so
              // this dialog's own button handlers and its own click-outside-
              // to-close behavior are unaffected; only propagation to the
              // OUTER modal's separate onClick handler is stopped.
              onClick={(event) => event.stopPropagation()}
              onRequestSubmit={() => {
                deleteRecord.mutate(id, {
                  // DELETE is 204 on a clean delete, 200 with a warning when
                  // build_index.py reported issues. Separate from onClose,
                  // which Carbon calls with an event.
                  onSuccess: (data) => {
                    setShowDeleteConfirm(false);
                    onDeleted(data?.warning);
                  },
                });
              }}
              onRequestClose={() => setShowDeleteConfirm(false)}
          >
            <p>
              This will permanently delete "{record.data.title}". This cannot be undone.
            </p>
            {deleteRecord.isError && (
                <InlineNotification
                    kind="error"
                    title="Failed to delete"
                    subtitle={deleteRecord.error.message}
                />
            )}
          </Modal>,
          document.body
      )}

      {showHistory && createPortal(
          <Modal
              open
              modalHeading="Edit history"
              passiveModal
              onRequestClose={() => setShowHistory(false)}
          >
            {history.isLoading && <p>Loading history…</p>}
            {history.isError && (
                <InlineNotification
                    kind="error"
                    title="Failed to load history"
                    subtitle={history.error.message}
                />
            )}
            {history.data && (
                <ul>
                  {history.data.map((entry) => (
                      <li key={entry.hash}>
                        <strong>{entry.authorName}</strong> — {new Date(entry.date).toLocaleString()}
                        <br />
                        {entry.message}
                      </li>
                  ))}
                </ul>
            )}
          </Modal>,
          document.body
      )}
    </Modal>
  );
}
