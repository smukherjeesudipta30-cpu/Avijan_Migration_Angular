import { PreSchoolSalaryPayment } from '../models/preschool-finance.model';
import { monthLabel } from '../models/preschool-student.model';
import { escapeHtml } from './legacy-documents';

const rupees = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n);

/**
 * An Avijan PreSchool honorarium slip for one month, in the PreSchool's own
 * look: the fixed honorarium, any deduction for absence, reference fees for
 * admissions referred, and what was paid. `forPdf` leaves out the print button
 * and the on-screen margin, for saving as a PDF file.
 */
export function preSchoolPayslipHtml(p: PreSchoolSalaryPayment, forPdf = false): string {
  const e = escapeHtml;
  const [y, m, d] = p.paidOn.split('-').map(Number);
  const paidOn = new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  const month = monthLabel(p.forMonth);
  const img = (name: string) => `${location.origin}/images/${name}`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${e(p.schoolName)} — Honorarium slip ${e(p.staffName)} ${e(month)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@500;700;800&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  body { font-family: 'Nunito', 'Segoe UI', Arial, sans-serif; color: #2a2f45; margin: 0; background: ${forPdf ? '#fff' : '#fffaf3'}; }
  .sheet { position: relative; max-width: 680px; margin: ${forPdf ? '0' : '24px'} auto; background: #fff; padding: 26px 34px 30px;
    border-radius: ${forPdf ? '0' : '26px'}; border: 2px solid #ffd6e2; overflow: hidden; }
  .sheet::before { content: ''; position: absolute; inset: 0 0 auto 0; height: 10px;
    background: linear-gradient(90deg, #ff6b8b, #ffb347 35%, #6cc56c 65%, #4aa3ff); }
  .head { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding-top: 6px; }
  .head img { width: 330px; max-width: 70%; height: auto; }
  .tag { text-align: right; }
  .tag span { display: inline-block; padding: 5px 14px; border-radius: 999px; background: #ffe3ec; color: #b3264f;
    font-weight: 800; font-size: 13px; letter-spacing: .06em; text-transform: uppercase; }
  .tag strong { display: block; margin-top: 6px; font-size: 20px; }
  .addr { margin: 8px 0 0; font-size: 12px; color: #6b7088; }
  .who { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin: 18px 0; }
  .who div { padding: 9px 11px; border-radius: 14px; background: #f3f9ff; font-size: 14px; font-weight: 700; }
  .who div:nth-child(2) { background: #fff1d6; } .who div:nth-child(3) { background: #e6f8e6; } .who div:nth-child(4) { background: #ffe3ec; }
  .who b { display: block; font-size: 10.5px; text-transform: uppercase; letter-spacing: .07em; color: #6b7088; font-weight: 800; }
  table { width: 100%; border-collapse: collapse; font-size: 15px; }
  td { padding: 11px 6px; border-bottom: 2px dashed #f2e6ea; }
  .amt { text-align: right; white-space: nowrap; font-weight: 700; }
  .minus { color: #b42318; } .plus { color: #2b7a2b; }
  tfoot td { border-bottom: 0; padding-top: 14px; font-size: 18px; font-weight: 800; }
  tfoot .amt { color: #b3264f; font-size: 22px; }
  .words { margin: 6px 0 0; font-size: 13px; color: #4a5068; font-style: italic; }
  .pay { margin-top: 16px; padding: 11px 14px; border-radius: 14px; background: #fffaf3; border: 1px solid #ffe0a3; font-size: 13.5px; }
  .sign { display: flex; justify-content: space-between; margin-top: 52px; font-size: 12.5px; color: #6b7088; }
  .sign span { border-top: 2px solid #ffc2d1; padding-top: 7px; min-width: 180px; text-align: center; }
  .foot { margin-top: 18px; text-align: center; font-size: 11px; color: #9aa0b4; }
  .actions { text-align: center; margin: 0 0 24px; }
  .actions button { font: 800 15px 'Nunito', 'Segoe UI', Arial; padding: 11px 26px; border-radius: 999px; border: 0; background: #ff6b8b; color: #fff; cursor: pointer; }
  @media (max-width: 560px) { .who { grid-template-columns: 1fr 1fr; } .head { flex-direction: column; align-items: flex-start; } .tag { text-align: left; } }
  @media print { body { background: #fff; } .sheet { margin: 0; border-radius: 0; } .actions { display: none; } }
</style></head><body>
  <div class="sheet">
    <div class="head">
      <img src="${img('preschool/receipt-header.png')}" alt="${e(p.schoolName)}, powered by My Chhota School">
      <div class="tag"><span>Honorarium slip</span><strong>${e(month)}</strong></div>
    </div>
    ${p.schoolAddress ? `<p class="addr">${e(p.schoolAddress)}</p>` : ''}
    <div class="who">
      <div><b>Name</b>${e(p.staffName)}</div>
      <div><b>Role</b>${e(p.role)}</div>
      <div><b>Paid on</b>${paidOn}</div>
      <div><b>Days absent</b>${p.daysAbsent}</div>
    </div>
    <table>
      <tbody>
        <tr><td>Monthly honorarium</td><td class="amt">${rupees(p.salary)}</td></tr>
        <tr><td>Less: deduction for absence</td><td class="amt ${p.deduction ? 'minus' : ''}">${p.deduction ? '− ' + rupees(p.deduction) : rupees(0)}</td></tr>
        ${p.referralBonus ? `<tr><td>Add: reference fees (admissions referred)</td><td class="amt plus">+ ${rupees(p.referralBonus)}</td></tr>` : ''}
      </tbody>
      <tfoot><tr><td>Honorarium paid</td><td class="amt">${rupees(p.netPaid)}</td></tr></tfoot>
    </table>
    <p class="words">Rupees ${e(p.netPaidInWords)} only.</p>
    <div class="pay">Paid by <strong>${e(p.mode)}</strong>${p.reference ? ` · Ref. ${e(p.reference)}` : ''}${p.notes ? ` · ${e(p.notes)}` : ''}</div>
    <div class="sign"><span>Received by ${e(p.staffName)}</span><span>For ${e(p.schoolName)}</span></div>
    <p class="foot">This is a system generated honorarium slip.</p>
  </div>
  ${forPdf ? '' : '<div class="actions"><button onclick="window.print()">Print / Save as PDF</button></div>'}
</body></html>`;
}
