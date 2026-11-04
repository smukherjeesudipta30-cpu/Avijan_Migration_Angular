import { PreSchoolSalaryPayment } from '../models/preschool-finance.model';
import { monthLabel } from '../models/preschool-student.model';
import { escapeHtml } from './legacy-documents';

const rupees = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(n);

/** An Avijan PreSchool salary slip for one month: the fixed salary, any deduction for absence, and what was paid. */
export function preSchoolPayslipHtml(p: PreSchoolSalaryPayment): string {
  const e = escapeHtml;
  const [y, m, d] = p.paidOn.split('-').map(Number);
  const paidOn = new Date(y, m - 1, d).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>${e(p.schoolName)} — Salary slip ${e(p.staffName)} ${e(monthLabel(p.forMonth))}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2433; margin: 0; background: #f3f4f8; }
  .sheet { max-width: 640px; margin: 24px auto; background: #fff; padding: 30px 34px; border-radius: 14px; border-top: 10px solid #6d28d9; }
  h1 { margin: 0; font-size: 21px; }
  .addr { margin: 4px 0 0; font-size: 12px; color: #5b6178; }
  h2 { margin: 18px 0 4px; font-size: 15px; letter-spacing: .08em; text-transform: uppercase; color: #6d28d9; }
  .who { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 24px; margin: 12px 0 18px; font-size: 14px; }
  .who b { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: #6b7088; font-weight: 600; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  td { padding: 9px 4px; border-bottom: 1px solid #f0f1f6; }
  .amt { text-align: right; }
  tfoot td { font-weight: 700; font-size: 16px; border-bottom: 0; }
  .words { font-size: 13px; color: #3a4057; }
  .pay { margin-top: 14px; padding: 10px 12px; border-radius: 10px; background: #f5f3ff; font-size: 13px; }
  .sign { display: flex; justify-content: space-between; margin-top: 46px; font-size: 12px; color: #6b7088; }
  .sign span { border-top: 1px solid #c9cede; padding-top: 6px; min-width: 160px; text-align: center; }
  .actions { text-align: center; margin: 0 0 24px; }
  .actions button { font: 600 14px 'Segoe UI', Arial; padding: 10px 22px; border-radius: 999px; border: 0; background: #6d28d9; color: #fff; cursor: pointer; }
  @media print { body { background: #fff; } .sheet { margin: 0; } .actions { display: none; } }
</style></head><body>
  <div class="sheet">
    <h1>${e(p.schoolName)}</h1>${p.schoolAddress ? `<p class="addr">${e(p.schoolAddress)}</p>` : ''}
    <h2>Salary slip · ${e(monthLabel(p.forMonth))}</h2>
    <div class="who">
      <div><b>Name</b>${e(p.staffName)}</div><div><b>Role</b>${e(p.role)}</div>
      <div><b>Paid on</b>${paidOn}</div><div><b>Days absent</b>${p.daysAbsent}</div>
    </div>
    <table>
      <tbody>
        <tr><td>Monthly salary (fixed)</td><td class="amt">${rupees(p.salary)}</td></tr>
        <tr><td>Less: deduction for absence</td><td class="amt">${p.deduction ? '− ' + rupees(p.deduction) : rupees(0)}</td></tr>
      </tbody>
      <tfoot><tr><td>Net paid</td><td class="amt">${rupees(p.netPaid)}</td></tr></tfoot>
    </table>
    <p class="words">Rupees ${e(p.netPaidInWords)} only.</p>
    <div class="pay">Paid by <strong>${e(p.mode)}</strong>${p.reference ? ` · Ref. ${e(p.reference)}` : ''}${p.notes ? ` · ${e(p.notes)}` : ''}</div>
    <div class="sign"><span>Received by ${e(p.staffName)}</span><span>For ${e(p.schoolName)}</span></div>
  </div>
  <div class="actions"><button onclick="window.print()">Print / Save as PDF</button></div>
</body></html>`;
}
