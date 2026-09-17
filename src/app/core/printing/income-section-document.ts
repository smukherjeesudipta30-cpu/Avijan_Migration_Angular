import { ContactDetails } from '../models/about.model';
import { IncomeDetail } from '../models/income.model';
import { formatMoney } from '../format/money';
import { escapeHtml } from './legacy-documents';

/** Everything the printed sheet needs, gathered by the caller. */
export interface IncomeSectionDocument {
  /** The tab's own label — "Fee collections", "Institute expenses", … */
  sectionLabel: string;

  from: string;
  to: string;

  /** Null for the whole institute. */
  branch: string | null;

  /** The section's total across the whole range, not just these rows. */
  total: number;
  rowCount: number;

  /** Every row in the section, not only the page on screen. */
  rows: IncomeDetail[];

  /**
   * True when the row list was capped. The sheet says so rather than looking
   * complete while quietly being short.
   */
  truncated: boolean;

  /** Letterhead details, read from the API so they cannot drift. */
  contact: ContactDetails | null;
}

/**
 * One section of the income report as a letterheaded A4 sheet.
 *
 * <p>Built for a reader outside the institute — a bank, an auditor — so it
 * states the period, the branch, the total and every row behind it, and says
 * plainly that it is drawn from the institute's own records rather than
 * independently audited. A figure without that caveat invites the assumption
 * that it carries one.</p>
 *
 * <p>Deliberately a print sheet rather than a generated PDF file: the browser's
 * own "Save as PDF" produces selectable text and real page breaks, needs no
 * library, and prints identically from any machine.</p>
 */
export function incomeSectionDocumentHtml(d: IncomeSectionDocument): string {
  const e = escapeHtml;
  const money = (v?: number | null) => formatMoney(v);

  const period = `${formatDate(d.from)} to ${formatDate(d.to)}`;
  const scope = d.branch ? `${e(d.branch)} branch` : 'All branches';

  const address = d.contact
    ? `${e(d.contact.addressLine1)}${d.contact.addressLine2 ? ', ' + e(d.contact.addressLine2) : ''}<br>
       Phone ${e(d.contact.phone)} &nbsp;&middot;&nbsp; ${e(d.contact.email)}`
    : '53, Aghore Sarani, Rajpur, Kol-149';

  /* A row carries a student or a teacher depending on the section, never both,
     so one column holds whichever is present. */
  const body = d.rows.map((r, i) => `
    <tr>
      <td class="n muted">${i + 1}</td>
      <td>${r.date ? formatDate(r.date) : '&mdash;'}</td>
      <td class="ref">${e(r.reference) || '&mdash;'}</td>
      <td>
        ${e(r.studentName ?? r.teacherName) || '&mdash;'}
        ${r.registrationId ? `<div class="muted small">${e(r.registrationId)}</div>` : ''}
      </td>
      <td>${e(r.courseName) || '&mdash;'}</td>
      <td>${e(r.description) || '&mdash;'}</td>
      <td class="n">${money(r.amount)}</td>
    </tr>`).join('');

  const truncationNote = d.truncated
    ? `<p class="warn">Only the first ${d.rows.length.toLocaleString('en-IN')} of
       ${d.rowCount.toLocaleString('en-IN')} entries are listed. The total above covers
       every entry in the period; narrow the date range to list them all.</p>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${e(d.sectionLabel)} — ${period}</title>
<style>
  @page { size: A4; margin: 14mm; }

  body {
    font-family: "Segoe UI", Arial, sans-serif;
    color: #14181D; margin: 0; font-size: 11px; line-height: 1.5;
  }

  .head { display: flex; gap: 14px; align-items: flex-start;
          border-bottom: 2.5px solid #14181D; padding-bottom: 8px; }
  .head img { width: 62px; height: auto; }
  .org { flex: 1; }
  .org h1 { font-family: Georgia, serif; font-size: 19px; margin: 0; letter-spacing: .3px; }
  .org .tag { font-size: 10px; color: #5A6470; margin: 1px 0 4px; }
  .org address { font-style: normal; font-size: 10px; color: #5A6470; line-height: 1.45; }
  .iso { text-align: right; font-size: 9px; color: #5A6470;
         border-left: 1px solid #E4E8EC; padding-left: 10px; line-height: 1.45; }
  .iso strong { display: block; color: #14181D; font-size: 10px; }

  .title { text-align: center; margin: 16px 0 4px; }
  .title h2 { font-family: Georgia, serif; font-size: 15px; margin: 0;
              text-transform: uppercase; letter-spacing: 1px; }
  .title p { margin: 3px 0 0; font-size: 10.5px; color: #5A6470; }

  .summary { display: flex; justify-content: space-between; align-items: baseline;
             background: #F4F6F8; border: 1px solid #E4E8EC;
             padding: 8px 12px; margin: 14px 0 0; }
  .summary .lbl { font-size: 10px; text-transform: uppercase; letter-spacing: .8px; color: #5A6470; }
  .summary .amt { font-size: 17px; font-weight: 700; }

  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { padding: 4px 6px; border-bottom: 1px solid #E4E8EC; text-align: left;
           vertical-align: top; }
  thead th { font-size: 9px; text-transform: uppercase; letter-spacing: .6px;
             color: #5A6470; border-bottom: 1.2px solid #C9D0D8; }
  thead { display: table-header-group; }   /* repeats on every printed page */
  tr { break-inside: avoid; }
  .n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ref { font-family: Consolas, monospace; font-size: 10px; }
  .muted { color: #5A6470; }
  .small { font-size: 9px; }
  tfoot td { border-top: 1.5px solid #14181D; border-bottom: 0;
             font-weight: 700; font-size: 12px; padding-top: 7px; }

  .warn { font-size: 10px; color: #7A5B00; background: #FFF8E1;
          border-left: 3px solid #C89A00; padding: 6px 9px; margin-top: 10px; }

  .note { margin-top: 16px; font-size: 9.5px; color: #5A6470; line-height: 1.5;
          border-top: 1px solid #E4E8EC; padding-top: 8px; }

  .generated { margin-top: 26px; padding-top: 8px; border-top: 1px solid #C9D0D8;
               text-align: center; font-size: 10px; color: #5A6470;
               letter-spacing: .3px; }

  @media print { .noprint { display: none; } }
  .noprint { text-align: center; padding: 10px; background: #14181D; }
  .noprint button { font: 600 13px "Segoe UI", sans-serif; padding: 7px 18px;
                    border: 0; border-radius: 3px; cursor: pointer; }
</style>
</head>
<body>

<div class="noprint">
  <button onclick="window.print()">Print / Save as PDF</button>
</div>

<div class="head">
  <img src="/images/file_trans.png" alt="Avijan Computer Centre">
  <div class="org">
    <h1>AVIJAN COMPUTER CENTRE</h1>
    <p class="tag">An Unit of Computer Professionals &amp; Learners</p>
    <address>${address}</address>
  </div>
  <div class="iso">
    <strong>ISO 9001:2015</strong>
    Certified institution<br>Established 2008
  </div>
</div>

<div class="title">
  <h2>${e(d.sectionLabel)}</h2>
  <p>For the period ${period} &nbsp;&middot;&nbsp; ${scope}</p>
</div>

<div class="summary">
  <span class="lbl">Total for the period &mdash; ${d.rowCount.toLocaleString('en-IN')} entr${d.rowCount === 1 ? 'y' : 'ies'}</span>
  <span class="amt">${money(d.total)}</span>
</div>

${truncationNote}

<table>
  <thead>
    <tr>
      <th class="n">#</th><th>Date</th><th>Reference</th>
      <th>Student / Teacher</th><th>Course</th><th>Description</th>
      <th class="n">Amount</th>
    </tr>
  </thead>
  <tbody>${body}</tbody>
  <tfoot>
    <tr>
      <td colspan="6">Total</td>
      <td class="n">${money(d.total)}</td>
    </tr>
  </tfoot>
</table>

<div class="note">
  Extracted from the institute&rsquo;s own management system on
  ${formatDate(new Date().toISOString())}. Amounts are in Indian Rupees.
  This statement has not been independently audited.
</div>

<div class="generated">
  This is a computer generated report. Signature not required.
</div>

</body>
</html>`;
}

/** 22 Aug 2026 — unambiguous on a document that may cross borders. */
function formatDate(iso: string): string {
  const d = new Date(iso);

  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
