import { Modal, Tag, InlineNotification } from '@carbon/react';
import { useRecord } from './api/records';
import './RecordDetail.module.scss';

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

export default function RecordDetail({ id, onClose }) {
  const record = useRecord(id);

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

      {record.data && (
        <>
          <p>{record.data.date}</p>
          <Tag type="gray">{record.data.type}</Tag>
          {record.data.tags.map((tag) => (
            <Tag key={tag} type="blue">{tag}</Tag>
          ))}
          <div dangerouslySetInnerHTML={{ __html: cleanRecordHtml(record.data.html) }} />
        </>
      )}
    </Modal>
  );
}
