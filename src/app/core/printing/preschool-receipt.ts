import { PreSchoolReceipt, monthLabel } from '../models/preschool-student.model';
import { escapeHtml } from './legacy-documents';

const rupees = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n);

const dateLabel = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
};

/**
 * An Avijan PreSchool money receipt, as a page of its own to print or save as
 * PDF. One row per fee head and month, so a parent sees exactly what they paid
 * for; a cancelled receipt prints with CANCELLED across it.
 */
export function preSchoolReceiptHtml(r: PreSchoolReceipt): string {
  const e = escapeHtml;
  const rows = r.lines.map(l => `
      <tr${l.amount < 0 ? ' class="minus"' : ''}>
        <td>${e(l.description)}</td>
        <td class="amt">${l.amount < 0 ? '− ' : ''}${rupees(Math.abs(l.amount))}</td>
      </tr>`).join('');

  const months = [...new Set(r.lines.filter(l => l.forMonth).map(l => l.forMonth!))].sort().map(monthLabel);

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${e(r.schoolName)} — Receipt ${e(r.receiptCode)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2433; margin: 0; background: #f3f4f8; }
  .sheet { position: relative; max-width: 720px; margin: 24px auto; background: #fff; padding: 32px 36px; border-radius: 14px;
    border-top: 10px solid #ff6b8b; }
  .head { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; border-bottom: 2px dashed #ffc2d1; padding-bottom: 16px; }
  .brand { display: flex; gap: 12px; align-items: center; }
  .mark { width: 46px; height: 46px; border-radius: 12px; background: #ff6b8b; color: #fff; font: 800 24px/46px 'Segoe UI', Arial; text-align: center; }
  h1 { margin: 0; font-size: 22px; }
  .addr { margin: 4px 0 0; font-size: 12px; color: #5b6178; max-width: 360px; }
  .no { text-align: right; }
  .no strong { display: block; font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color: #b3264f; }
  .no span { font-size: 20px; font-weight: 700; }
  .no small { display: block; color: #5b6178; margin-top: 2px; }
  .who { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin: 18px 0; font-size: 14px; }
  .who b { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #6b7088; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #6b7088; border-bottom: 1px solid #e4e6ef; padding: 8px 4px; }
  td { padding: 8px 4px; border-bottom: 1px solid #f0f1f6; }
  .amt { text-align: right; white-space: nowrap; }
  tr.minus td { color: #2b7a2b; }
  tfoot td { font-weight: 700; font-size: 16px; border-bottom: 0; padding-top: 12px; }
  .words { margin: 6px 0 0; font-size: 13px; color: #3a4057; }
  .pay { margin-top: 16px; padding: 10px 12px; border-radius: 10px; background: #fff7fa; font-size: 13px; }
  .foot { margin-top: 26px; display: flex; justify-content: space-between; font-size: 12px; color: #6b7088; }
  .void { position: absolute; top: 40%; left: 50%; transform: translate(-50%, -50%) rotate(-18deg); font-size: 72px; font-weight: 900;
    color: rgba(180, 35, 24, .18); border: 6px solid rgba(180, 35, 24, .18); padding: 4px 24px; border-radius: 12px; pointer-events: none; }
  .actions { text-align: center; margin: 0 0 24px; }
  .actions button { font: 600 14px 'Segoe UI', Arial; padding: 10px 22px; border-radius: 999px; border: 0; background: #ff6b8b; color: #fff; cursor: pointer; }
  @media print { body { background: #fff; } .sheet { margin: 0; border-radius: 0; } .actions { display: none; } }
</style></head>
<body>
  <div class="sheet">
    ${r.isCancelled ? '<div class="void">CANCELLED</div>' : ''}
    <div class="head">
      <div class="brand">
        <div class="mark">A</div>
        <div>
          <h1>${e(r.schoolName)}</h1>
          ${r.schoolAddress ? `<p class="addr">${e(r.schoolAddress)}</p>` : ''}
          ${r.schoolPhone ? `<p class="addr">Phone: ${e(r.schoolPhone)}</p>` : ''}
        </div>
      </div>
      <div class="no"><strong>Money receipt</strong><span>${e(r.receiptCode)}</span><small>${dateLabel(r.receivedOn)}</small></div>
    </div>

    <div class="who">
      <div><b>Child</b>${e(r.childName)} (${e(r.admissionCode)})</div>
      <div><b>Class</b>${e(r.className)}</div>
      <div><b>Parent</b>${e(r.parentName)}</div>
      <div><b>Phone</b>${e(r.phone)}</div>
      ${months.length ? `<div style="grid-column: 1 / -1"><b>Months paid</b>${months.join(', ')}</div>` : ''}
    </div>

    <table>
      <thead><tr><th>Particulars</th><th class="amt">Amount</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>Total received</td><td class="amt">${rupees(r.total)}</td></tr></tfoot>
    </table>
    <p class="words">Rupees ${e(r.totalInWords)} only.</p>

    <div class="pay">Paid by <strong>${e(r.mode)}</strong>${r.reference ? ` · Ref. ${e(r.reference)}` : ''}${r.notes ? ` · ${e(r.notes)}` : ''}</div>

    <div class="foot">
      <span>Received by ${e(r.receivedBy ?? 'the office')}</span>
      <span>This is a computer generated receipt. No signature is required.</span>
    </div>
  </div>
  <div class="actions"><button onclick="window.print()">Print / Save as PDF</button></div>
</body></html>`;
}
