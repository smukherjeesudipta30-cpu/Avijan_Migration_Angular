/**
 * Downloads rows as a CSV file that Excel opens directly. Written with a UTF-8
 * byte-order mark so ₹ and Bengali names come through, and with every value
 * quoted so commas and line breaks inside a note stay in their cell.
 */
export function downloadCsv(fileName: string, sections: { title?: string; header: string[]; rows: (string | number | null | undefined)[][] }[]): void {
  const cell = (v: string | number | null | undefined) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines: string[] = [];
  for (const s of sections) {
    if (lines.length) lines.push('');
    if (s.title) lines.push(cell(s.title));
    lines.push(s.header.map(cell).join(','));
    for (const r of s.rows) lines.push(r.map(cell).join(','));
  }

  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.csv') ? fileName : `${fileName}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
