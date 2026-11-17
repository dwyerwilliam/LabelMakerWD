export interface TextRange {
  start: number;
  end: number;
}

export function getCaretCharacterOffsetWithin(element: HTMLElement): TextRange {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return { start: 0, end: 0 };
  }

  const range = selection.getRangeAt(0);
  if (!element.contains(range.commonAncestorContainer)) {
    return { start: 0, end: 0 };
  }

  const preCaretRange = range.cloneRange();
  preCaretRange.selectNodeContents(element);
  preCaretRange.setEnd(range.startContainer, range.startOffset);
  const start = preCaretRange.toString().length;

  const end = start + range.toString().length;

  return { start, end };
}

export function setCaretCharacterOffsetWithin(element: HTMLElement, targetOffset: number): void {
  const selection = window.getSelection();
  if (!selection) return;

  const range = document.createRange();
  let currentOffset = 0;
  let found = false;

  function traverseNodes(node: Node) {
    if (found) return;

    if (node.nodeType === Node.TEXT_NODE) {
      const textLen = (node.textContent || '').length;
      if (currentOffset + textLen >= targetOffset) {
        const offsetInNode = Math.min(Math.max(0, targetOffset - currentOffset), textLen);
        range.setStart(node, offsetInNode);
        range.setEnd(node, offsetInNode);
        found = true;
        return;
      }
      currentOffset += textLen;
    } else {
      for (let i = 0; i < node.childNodes.length; i++) {
        traverseNodes(node.childNodes[i]);
        if (found) return;
      }
    }
  }

  traverseNodes(element);

  if (!found) {
    range.selectNodeContents(element);
    range.collapse(false);
  }

  selection.removeAllRanges();
  selection.addRange(range);
}
