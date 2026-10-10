/**
 * Helpers shared by the six report pages.
 *
 * The legacy reports each carried their own copy of a `convert()` date formatter
 * and, in one case, an Excel export that wrote an HTML table to a `.xls` file.
 * They are here once.
 */

/** `yyyy-MM-dd` in local time. `toISOString()` would shift the day across a timezone. */
export function toIsoDate(date: Date | null): string | null {
  if (!date) return null;

  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');

  return `${date.getFullYear()}-${month}-${day}`;
}

/** First day of the current month, the default 'from' on every report. */
export function startOfMonth(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1);
}

/** Escapes one CSV field: quotes wrap it, inner quotes double. */
function csvField(value: unknown): string {
  if (value === null || value === undefined) return '';

  const text = value instanceof Date ? (toIsoDate(value) ?? '') : String(value);

  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Downloads rows as a real CSV.
 *
 * The legacy "Download Excel" on the student/teacher report wrote an HTML
 * `<table>` into a file named `.xls`, which every recent Excel opens with a
 * "the file format does not match the extension" warning. This writes CSV, which
 * Excel opens without complaint, and prefixes a UTF-8 BOM so Bengali names in the
 * data survive the round trip.
 */
export function downloadCsv(
  fileName: string,
  headers: string[],
  rows: readonly unknown[][]
): void {
  const lines = [headers.map(csvField).join(',')];

  for (const row of rows) {
    lines.push(row.map(csvField).join(','));
  }

  const blob = new Blob(['﻿' + lines.join('\r\n')], {
    type: 'text/csv;charset=utf-8;'
  });

  void downloadBlob(blob, fileName.endsWith('.csv') ? fileName : `${fileName}.csv`);
}

/** `report-name-2026-08-23.csv` */
export function reportFileName(prefix: string): string {
  return `${prefix}-${toIsoDate(new Date())}.csv`;
}import { downloadBlob } from '../../core/printing/download-file';

