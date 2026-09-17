import { ContactDetails } from '../models/about.model';
import { IncomeReport } from '../models/income.model';
import { formatMoney } from '../format/money';
import { escapeHtml } from './legacy-documents';

/**
 * The whole income report as a letterheaded statement of income and
 * expenditure, with the month-by-month movement behind the net figure.
 *
 * <p>Where the per-tab sheet answers "show me the entries behind this number",
 * this answers "did the institute make money, and when". It is the one to hand
 * a bank.</p>
 *
 * <p>The arithmetic is not recomputed here. Every figure is taken from the
 * report the server already produced, so the printed sheet and the screen can
 * never disagree — a statement that quietly re-derived its own totals would be
 * a second implementation to keep in step, and the first to drift.</p>
 */
export function incomeSummaryDocumentHtml(
  r: IncomeReport,
  contact: ContactDetails | null
): string {
  const e = escapeHtml;
  const money = (v?: number | null) => formatMoney(v);

  const period = `${formatDate(r.from)} to ${formatDate(r.to)}`;
  const scope = r.branch ? `${e(r.branch)} branch` : 'All branches';

  const address = contact
    ? `${e(contact.addressLine1)}${contact.addressLine2 ? ', ' + e(contact.addressLine2) : ''}<br>
       Phone ${e(contact.phone)} &nbsp;&middot;&nbsp; ${e(contact.email)}`
    : '53, Aghore Sarani, Rajpur, Kol-149';

  /* Breakdowns are shown but never summed: a late fine already sits inside fee
     collections, and cash paid to teachers settles the share already counted
     when the fee came in. Adding either would count the same rupee twice. */
  const income = r.sections.filter(s => !s.isCost && !s.isBreakdown);
  const incomeNotes = r.sections.filter(s => !s.isCost && s.isBreakdown);
  const costs = r.sections.filter(s => s.isCost && !s.isBreakdown);
  const costNotes = r.sections.filter(s => s.isCost && s.isBreakdown);

  const line = (label: string, count: number, amount: number, cls = '') => `
    <tr class="${cls}">
      <td>${e(label)}</td>
      <td class="n muted">${count.toLocaleString('en-IN')}</td>
      <td class="n">${money(amount)}</td>
    </tr>`;

  const noteLine = (label: string, count: number, amount: number) => `
    <tr class="breakdown">
      <td class="indent">of which ${e(label.replace(/^of which /i, '').toLowerCase())}</td>
      <td class="n muted">${count.toLocaleString('en-IN')}</td>
      <td class="n muted">${money(amount)}</td>
    </tr>`;

  const monthRows = r.monthly.map(m => `
    <tr>
      <td>${e(m.label)}</td>
      <td class="n">${money(m.income)}</td>
      <td class="n">${money(m.cost)}</td>
      <td class="n ${m.net < 0 ? 'neg' : 'pos'}">${money(m.net)}</td>
      <td class="n muted">${m.income > 0
        ? (m.net / m.income * 100).toFixed(1) + '%'
        : '&mdash;'}</td>
    </tr>`).join('');

  const best = r.monthly.length
    ? r.monthly.reduce((a, b) => (b.net > a.net ? b : a))
    : null;
  const worst = r.monthly.length
    ? r.monthly.reduce((a, b) => (b.net < a.net ? b : a))
    : null;

  const branchNote = r.branchScoped
    ? `<li>This statement covers <strong>${scope}</strong> only. Other income and
        cash paid to teachers are recorded against the institute rather than a
        branch, so they are not included in a branch-scoped statement.</li>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Income &amp; Expenditure — ${period}</title>
<style>
  @page { size: A4; margin: 14mm; }

  body { font-family: "Segoe UI", Arial, sans-serif; color: #14181D;
         margin: 0; font-size: 11px; line-height: 1.5; }

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

  .title { text-align: center; margin: 16px 0 2px; }
  .title h2 { font-family: Georgia, serif; font-size: 15px; margin: 0;
              text-transform: uppercase; letter-spacing: 1px; }
  .title p { margin: 3px 0 0; font-size: 10.5px; color: #5A6470; }

  .kpis { display: flex; gap: 10px; margin-top: 14px; }
  .kpi { flex: 1; border: 1px solid #E4E8EC; background: #F7F9FA; padding: 8px 10px; }
  .kpi .lbl { font-size: 9px; text-transform: uppercase; letter-spacing: .7px; color: #5A6470; }
  .kpi .amt { font-size: 16px; font-weight: 700; margin-top: 2px; }
  .kpi.net { background: #F1F7F3; border-color: #BFD8C9; }

  h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
       color: #5A6470; margin: 18px 0 0; padding-bottom: 3px;
       border-bottom: 1px solid #C9D0D8; }

  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { padding: 4px 6px; border-bottom: 1px solid #E4E8EC; text-align: left; }
  thead th { font-size: 9px; text-transform: uppercase; letter-spacing: .6px;
             color: #5A6470; border-bottom: 1.2px solid #C9D0D8; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  .n { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .muted { color: #5A6470; }
  .indent { padding-left: 20px; font-style: italic; color: #5A6470; }
  .breakdown td { border-bottom: 1px dotted #E4E8EC; font-size: 10px; }
  tr.sum td { border-top: 1.4px solid #C9D0D8; border-bottom: 2.5px double #C9D0D8;
              font-weight: 700; }
  tr.grand td { border-top: 2px solid #14181D; border-bottom: 0;
                font-weight: 700; font-size: 13px; padding-top: 8px; }
  .pos { color: #1B5E3F; } .neg { color: #9C2A22; }

  .note { margin-top: 16px; font-size: 9.5px; color: #5A6470; line-height: 1.55;
          border-top: 1px solid #E4E8EC; padding-top: 8px; }
  .note ol { margin: 4px 0 0; padding-left: 14px; }
  .note li { margin-bottom: 3px; }

  .generated { margin-top: 24px; padding-top: 8px; border-top: 1px solid #C9D0D8;
               text-align: center; font-size: 10px; color: #5A6470; letter-spacing: .3px; }

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
  <h2>Statement of Income &amp; Expenditure</h2>
  <p>For the period ${period} &nbsp;&middot;&nbsp; ${scope}</p>
</div>

<div class="kpis">
  <div class="kpi"><div class="lbl">Total income</div><div class="amt">${money(r.totalIncome)}</div></div>
  <div class="kpi"><div class="lbl">Total expenditure</div><div class="amt">${money(r.totalCost)}</div></div>
  <div class="kpi net">
    <div class="lbl">Net ${r.netProfit < 0 ? 'deficit' : 'surplus'}</div>
    <div class="amt ${r.netProfit < 0 ? 'neg' : 'pos'}">${money(r.netProfit)}</div>
  </div>
  <div class="kpi"><div class="lbl">Margin</div><div class="amt">${r.marginPercent.toFixed(2)}%</div></div>
</div>

<h3>Income</h3>
<table>
  <thead><tr><th>Particulars</th><th class="n">Entries</th><th class="n">Amount</th></tr></thead>
  <tbody>
    ${income.map(s => line(s.label, s.rowCount, s.amount)).join('')}
    ${incomeNotes.map(s => noteLine(s.label, s.rowCount, s.amount)).join('')}
    ${line('Total income', income.reduce((t, s) => t + s.rowCount, 0), r.totalIncome, 'sum')}
  </tbody>
</table>

<h3>Expenditure</h3>
<table>
  <thead><tr><th>Particulars</th><th class="n">Entries</th><th class="n">Amount</th></tr></thead>
  <tbody>
    ${costs.map(s => line(s.label, s.rowCount, s.amount)).join('')}
    ${costNotes.map(s => noteLine(s.label, s.rowCount, s.amount)).join('')}
    ${line('Total expenditure', costs.reduce((t, s) => t + s.rowCount, 0), r.totalCost, 'sum')}
  </tbody>
</table>

<table>
  <tbody>
    <tr class="grand">
      <td>Net ${r.netProfit < 0 ? 'deficit' : 'surplus'} for the period</td>
      <td class="n"></td>
      <td class="n ${r.netProfit < 0 ? 'neg' : 'pos'}">${money(r.netProfit)}</td>
    </tr>
    <tr>
      <td class="muted">Movement in outstanding student dues over the period</td>
      <td class="n"></td>
      <td class="n muted">${money(r.duesMovement)}</td>
    </tr>
  </tbody>
</table>

<h3>Period by period</h3>
<table>
  <thead>
    <tr><th>Period</th><th class="n">Income</th><th class="n">Expenditure</th>
        <th class="n">Net</th><th class="n">Margin</th></tr>
  </thead>
  <tbody>${monthRows}</tbody>
  <tfoot>
    <tr class="sum">
      <td>Total</td>
      <td class="n">${money(r.totalIncome)}</td>
      <td class="n">${money(r.totalCost)}</td>
      <td class="n ${r.netProfit < 0 ? 'neg' : 'pos'}">${money(r.netProfit)}</td>
      <td class="n">${r.marginPercent.toFixed(1)}%</td>
    </tr>
  </tfoot>
</table>

<div class="note">
  <strong>Notes forming part of this statement</strong>
  <ol>
    <li>Figures are extracted from the institute&rsquo;s own management system on
        ${formatDate(r.generatedOn)}. <strong>This statement has not been
        independently audited.</strong></li>
    <li>Late fines are collected together with the monthly instalment and are already
        included within fee collections. They are shown as an &ldquo;of which&rdquo;
        line and are not added a second time.</li>
    <li>Teachers&rsquo; remuneration is recognised as it is earned &mdash; a share of
        each fee at the moment that fee is collected. Cash actually handed over is
        shown separately for information; within any single period the two differ
        purely by timing, and only the amount earned is charged against income.</li>
    ${best && worst && r.monthly.length > 1 ? `<li>Strongest period: <strong>${e(best.label)}</strong>
        at ${money(best.net)}. Weakest: <strong>${e(worst.label)}</strong>
        at ${money(worst.net)}.</li>` : ''}
    ${branchNote}
  </ol>
</div>

<div class="generated">
  This is a computer generated report. Signature not required.
</div>

</body>
</html>`;
}

/** 30 Aug 2026 — unambiguous on a document that may cross borders. */
function formatDate(iso: string): string {
  const d = new Date(iso);

  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
