export function normalizePlainText(raw: string): string {
  // Normalize newline characters to LF
  let text = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Convert each tab character to four spaces
  text = text.replace(/\t/g, '    ');

  return text;
}

export function sanitizePastedHtml(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  const rawText = div.innerText || div.textContent || '';
  return normalizePlainText(rawText);
}
