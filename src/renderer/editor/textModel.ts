export function normalizePlainText(raw: string): string {
  // Normalize newline characters to LF
  let text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Convert each tab character to four spaces
  text = text.replace(/\t/g, '    ');

  return text;
}

/**
 * Turns pasted HTML into plain text. The markup is parsed into an inert
 * document, so nothing in it can load resources or run script, which is not
 * true of setting `innerHTML` on an element in the live page.
 */
export function sanitizePastedHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return normalizePlainText(serializeEditableText(doc.body));
}

/** The small part of the DOM node interface the serializer reads, so it can be tested without a DOM. */
export interface SerializableNode {
  nodeType: number;
  nodeValue: string | null;
  tagName?: string;
  childNodes: ArrayLike<SerializableNode>;
}

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;

const BLOCK_TAGS = new Set([
  'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'DIV', 'DL', 'DT', 'DD', 'FIELDSET', 'FIGURE', 'FOOTER',
  'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER', 'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE',
  'SECTION', 'TABLE', 'TR', 'UL',
]);

function isBlock(node: SerializableNode): boolean {
  return node.nodeType === ELEMENT_NODE && BLOCK_TAGS.has((node.tagName ?? '').toUpperCase());
}

function isBreak(node: SerializableNode): boolean {
  return node.nodeType === ELEMENT_NODE && (node.tagName ?? '').toUpperCase() === 'BR';
}

/** Text of an inline element: its text nodes, with <br> as a line break. */
function inlineText(node: SerializableNode): string {
  let text = '';
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i];
    if (child.nodeType === TEXT_NODE) {
      text += child.nodeValue ?? '';
    } else if (isBreak(child)) {
      text += '\n';
    } else if (child.nodeType === ELEMENT_NODE) {
      text += inlineText(child);
    }
  }
  return text;
}

/** The lines contained in one container: runs of inline content, with each block element as its own line(s). */
function linesOf(container: SerializableNode): string[] {
  const lines: string[] = [];
  let current: string | null = null;

  const flush = () => {
    if (current !== null) lines.push(current);
    current = null;
  };

  const count = container.childNodes.length;
  for (let i = 0; i < count; i++) {
    const child = container.childNodes[i];

    if (child.nodeType === TEXT_NODE) {
      current = (current ?? '') + (child.nodeValue ?? '');
    } else if (isBreak(child)) {
      if (i === count - 1) {
        // A trailing <br> is the browser's placeholder that keeps an empty last
        // line visible. After other content it adds nothing; alone in a block
        // it stands for that block's empty line.
        if (current === null && isBlock(container)) lines.push('');
      } else {
        current = (current ?? '') + '\n';
      }
    } else if (isBlock(child)) {
      flush();
      lines.push(...linesOf(child));
    } else if (child.nodeType === ELEMENT_NODE) {
      current = (current ?? '') + inlineText(child);
    }
  }

  flush();
  return lines;
}

/**
 * Reads the label text out of the editable element.
 *
 * `innerText` cannot be used for this: a blank line made with Enter is stored
 * as `<div><br></div>`, and `innerText` reports it as two newlines, so the
 * model (and therefore the printed label) got an extra blank line that the
 * editor never showed. Here every block is one line and a lone <br> in a block
 * is one empty line.
 */
export function serializeEditableText(root: SerializableNode): string {
  return linesOf(root).join('\n');
}
