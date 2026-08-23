import { UserListItem } from '../../core/models/user.model';

/**
 * Offer and experience (release) letters, ported from `generateOfferLetter` and
 * `generateReleaseLetter` in `Scripts/Users.js`.
 *
 * The legacy version rendered the letter into a hidden div, then rasterised it with
 * html2canvas and wrapped the bitmap in a jsPDF page. That produced a blurry,
 * non-selectable PDF and pulled in two large libraries. These open a print window
 * instead: the browser's own "Save as PDF" gives real vector text, and there is no
 * dependency to ship.
 */

/** Only staff get letters — the same three roles the legacy page gated on. */
export const LETTER_ROLES = ['Receptionist', 'Receptionist & Teacher', 'Teacher'];

export function isLetterEligible(user: UserListItem): boolean {
  return LETTER_ROLES.some(
    role => (user.roles ?? '').trim().toLowerCase() === role.toLowerCase());
}

/** A release letter needs a leaving date, so it only applies once End_date is set. */
export function canIssueReleaseLetter(user: UserListItem): boolean {
  return isLetterEligible(user) && !!user.endDate;
}

/**
 * CTC split, exactly as the legacy script had it. The five percentages total 100,
 * so the breakup always adds back up to the CTC entered.
 */
export const SALARY_BREAKUP: ReadonlyArray<{ name: string; percent: number }> = [
  { name: 'Basic Pay', percent: 50 },
  { name: 'House Rent Allowance (HRA)', percent: 20 },
  { name: 'Conveyance Allowance', percent: 4.8 },
  { name: 'Medical Allowance', percent: 3.75 },
  { name: 'Special Allowance', percent: 21.45 }
];

const SIGNATORY = { name: 'Nargis Khatun', title: 'Senior Head Receptionist' };
const INSTITUTE = 'Avijan Computer Centre';

function inr(amount: number): string {
  return amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function longDate(value?: string | null): string {
  if (!value) return '—';

  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
}

function escapeHtml(value?: string | null): string {
  return (value ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

const LETTER_CSS = `
  @page { size: A4; margin: 18mm; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2430; line-height: 1.65; margin: 0; }
  .sheet { max-width: 720px; margin: 0 auto; padding: 32px; }
  .date { text-align: right; font-size: 13px; color: #4b5563; margin-bottom: 28px; }
  h3 { text-align: center; text-decoration: underline; margin: 0 0 26px; font-size: 17px; letter-spacing: 0.02em; }
  p { font-size: 14px; margin: 0 0 14px; }
  table { width: 100%; border-collapse: collapse; margin: 20px 0 28px; font-size: 13px; }
  th, td { border: 1px solid #000; padding: 8px; text-align: left; }
  thead th { background: #f3f4f6; }
  tfoot th { background: #f3f4f6; }
  .num { text-align: right; }
  .signature { text-align: right; margin-top: 56px; font-size: 14px; }
  .signature .space { height: 56px; }
  .signature p { margin: 0; }
  .toolbar { text-align: center; margin: 24px 0 0; }
  .toolbar button {
    font: inherit; padding: 8px 18px; border-radius: 8px; border: 1px solid #6d28d9;
    background: #6d28d9; color: #fff; cursor: pointer;
  }
  @media print { .toolbar { display: none; } .sheet { padding: 0; } }
`;

function openLetter(title: string, bodyHtml: string): boolean {
  const win = window.open('', '_blank', 'width=860,height=1000');
  if (!win) return false;

  win.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${LETTER_CSS}</style></head>
<body>
  <div class="sheet">
    ${bodyHtml}
    <div class="toolbar">
      <button onclick="window.print()">Print / Save as PDF</button>
    </div>
  </div>
</body></html>`);

  win.document.close();
  return true;
}

/**
 * Offer letter with the CTC breakup.
 * @param annualCtc Total annual cost to company, in rupees.
 */
export function openOfferLetter(user: UserListItem, annualCtc: number): boolean {
  const rows = SALARY_BREAKUP.map(item => {
    const annual = (annualCtc * item.percent) / 100;

    return `<tr>
      <td>${escapeHtml(item.name)}</td>
      <td class="num">₹${inr(annual)}</td>
      <td class="num">₹${inr(annual / 12)}</td>
    </tr>`;
  }).join('');

  const totalAnnual = SALARY_BREAKUP.reduce((sum, i) => sum + (annualCtc * i.percent) / 100, 0);

  const today = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

  return openLetter(`Offer letter — ${user.name ?? ''}`, `
    <div class="date">${today}</div>
    <h3>OFFER LETTER</h3>
    <p>Dear <strong>${escapeHtml(user.name)}</strong>,</p>
    <p>
      We are pleased to offer you the position of <strong>${escapeHtml(user.roles)}</strong>
      at <strong>${INSTITUTE}</strong>, starting from
      <strong>${longDate(user.registerDate)}</strong>.
    </p>
    <p>
      You will be entitled to a total annual Cost to Company (CTC) of
      <strong>₹${inr(annualCtc)}</strong>. Below is the detailed breakup of your compensation:
    </p>
    <table>
      <thead>
        <tr><th>Component</th><th class="num">Annual Amount (₹)</th><th class="num">Monthly Amount (₹)</th></tr>
      </thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr>
          <th>Total</th>
          <th class="num">₹${inr(totalAnnual)}</th>
          <th class="num">₹${inr(totalAnnual / 12)}</th>
        </tr>
      </tfoot>
    </table>
    <p>
      We look forward to welcoming you to our team. Kindly sign and return a copy of this
      letter as a token of your acceptance.
    </p>
    <div class="signature">
      <p><strong>Sincerely,</strong></p>
      <div class="space"></div>
      <p><strong>${SIGNATORY.name}</strong></p>
      <p>${SIGNATORY.title}</p>
      <p>${INSTITUTE}</p>
    </div>
  `);
}

/**
 * Experience / release letter.
 *
 * The legacy template repeated `id="rl_empName"` three times and only the first was
 * ever filled, so the second and third references rendered blank and the sentence
 * read "He/She has been released…" with nothing in front. The name is written out
 * properly here.
 */
export function openExperienceLetter(user: UserListItem): boolean {
  const today = new Date().toLocaleDateString('en-IN', {
    day: '2-digit', month: 'long', year: 'numeric'
  });

  const name = escapeHtml(user.name);
  const leaving = longDate(user.endDate);

  return openLetter(`Experience letter — ${user.name ?? ''}`, `
    <div class="date">${today}</div>
    <h3>TO WHOMSOEVER IT MAY CONCERN</h3>
    <p>
      This is to certify that <strong>${name}</strong> (Emp. id &mdash;
      <strong>${user.id}</strong>) was an employee of our <strong>${INSTITUTE}</strong>
      from the period of <strong>${longDate(user.registerDate)}</strong> to
      <strong>${leaving}</strong>. At the time of leaving, their designation was
      <strong>${escapeHtml(user.roles)}</strong>.
    </p>
    <p>
      ${name} has been released from their duties and responsibilities with effect from
      the closing business hours of <strong>${leaving}</strong>.
    </p>
    <p>We wish ${name} all success in their future endeavours.</p>
    <div class="signature">
      <p><strong>Sincerely,</strong></p>
      <div class="space"></div>
      <p><strong>${SIGNATORY.name}</strong></p>
      <p>${SIGNATORY.title},</p>
      <p>${INSTITUTE}</p>
    </div>
  `);
}
