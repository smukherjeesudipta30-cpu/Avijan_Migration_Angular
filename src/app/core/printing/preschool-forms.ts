import { PreSchoolEnquiry } from '../models/preschool.model';
import { PreSchoolReceipt, monthLabel } from '../models/preschool-student.model';
import { escapeHtml } from './legacy-documents';

/*
 * Avijan PreSchool's printed stationery, drawn to match the school's own
 * artwork ("Enquiry Form.pdf" and "Fee-Receipt.pdf") position for position.
 *
 * Each sheet is laid out in the artwork's own units (the A4 page read as
 * 920 × 1300) with absolute positions, then scaled onto the paper. The
 * header — logo, address and the My Chhota School badge — is the artwork
 * itself, cut from the PDFs, so it prints exactly as designed.
 */

const e = escapeHtml;
const img = (name: string) => `${location.origin}/images/preschool/${name}`;

/* ================================================================ enquiry */

/** The enquiry form's classes, in the printed order. */
export const ENQUIRY_CLASSES = ['Pre-Nursery', 'Nursery', 'LKG', 'UKG'] as const;
/** "Where did you get to know about School", in the printed order. */
export const ENQUIRY_SOURCES = ['Advertisement', 'Friends', 'Facebook', 'Leaflet', 'Hoardings', 'Others'] as const;

/** The session an enquiry made today is most likely for: "2026-27" all through 2026. */
export function currentSession(today = new Date()): string {
  const y = today.getFullYear();
  return `${y}-${`${(y + 1) % 100}`.padStart(2, '0')}`;
}

/** Splits an address over the form's two boxes, breaking between words. */
function twoLines(text: string | null | undefined, first = 62): [string, string] {
  const t = (text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= first) return [t, ''];
  const cut = t.lastIndexOf(' ', first);
  const at = cut > 20 ? cut : first;
  return [t.slice(0, at).trim(), t.slice(at).trim()];
}

const dmy = (iso: string | null | undefined) => {
  if (!iso) return '';
  const [y, m, d] = iso.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
};

/**
 * The Enquiry Form, both pages: the family's details, then the office's dated
 * feedback notes. With no enquiry it prints the blank form for the front desk.
 */
export function enquiryFormHtml(q: PreSchoolEnquiry | null, only?: 1 | 2): string {
  const v = (s: string | null | undefined) => e(s ?? '');
  const box = (x1: number, y1: number, x2: number, y2: number, text = '') =>
    `<div class="box" style="left:${x1}px;top:${y1}px;width:${x2 - x1}px;height:${y2 - y1}px">${text ? `<span>${text}</span>` : ''}</div>`;
  const label = (x: number, y: number, text: string, extra = '') =>
    `<div class="lbl${extra}" style="left:${x}px;top:${y}px">${text}</div>`;
  const tick = (x: number, y: number, on: boolean) =>
    `<div class="chk" style="left:${x}px;top:${y}px">${on ? '<b>&#10003;</b>' : ''}</div>`;
  const digits = (x: number, y: number, phone: string | null | undefined) => {
    const d = (phone ?? '').replace(/\D/g, '').slice(-10).padStart(phone ? 10 : 0, ' ');
    return `<div class="cells" style="left:${x}px;top:${y}px">${
      Array.from({ length: 10 }, (_, i) => `<i>${e((d[i] ?? '').trim())}</i>`).join('')}</div>`;
  };
  const person = (top: number, title: string, name?: string | null, occ?: string | null, phone?: string | null,
                  email?: string | null | false, address?: string | null) => {
    // Rows sit 52px apart; a guardian has no email row, so their address moves up one.
    const [a1, a2] = twoLines(address);
    const rows = [
      label(46, top, title), box(207, top - 14, 549, top + 13, v(name)),
      label(46, top + 52, 'Occupation:'), box(183, top + 38, 383, top + 65, v(occ)),
      label(420, top + 52, 'Contact No.:'), digits(547, top + 38, phone)
    ];
    let y = top + 104;
    if (email !== false) {
      rows.push(label(46, y, 'Email Id:'), box(173, y - 13, 884, y + 14, v(email || '')));
      y += 53;
    }
    rows.push(label(46, y, 'Address For Communication:'), box(330, y - 13, 884, y + 13, e(a1)),
      box(46, y + 39, 884, y + 66, e(a2)));
    return rows.join('');
  };

  const classOn = (c: string) => (q?.classWanted ?? '').toLowerCase() === c.toLowerCase();
  const heard = new Set(q?.heardFrom ?? []);
  const session = q?.session ? e(q.session) : '20.......-...........';

  const page1 = `
    <section class="sheet"><div class="frame"><div class="bd"></div>
      <img class="head" src="${img('enquiry-header.png')}" alt="Avijan Preschool, powered by My Chhota School. Enquiry Form">
      ${label(46, 255, 'Name of the Child:')}${box(227, 241, 478, 269, v(q?.childName))}
      ${label(555, 255, 'Session:')}${box(646, 241, 752, 269, session)}
      ${label(46, 302, 'Gender :')}${tick(148, 288, q?.gender === 'Female')}${label(183, 302, 'Female')}
      ${tick(298, 288, q?.gender === 'Male')}${label(339, 302, 'Male')}
      ${label(439, 302, 'Date Of Birth:')}${box(576, 288, 828, 316, dmy(q?.childDateOfBirth))}
      ${label(46, 354, 'Admission Sought in:')}
      ${tick(45, 394, classOn('Pre-Nursery'))}${label(82, 407, 'Pre-Nursery')}
      ${tick(213, 394, classOn('Nursery'))}${label(250, 407, 'Nursery')}
      ${tick(347, 394, classOn('LKG'))}${label(385, 407, 'LKG')}
      ${tick(444, 394, classOn('UKG'))}${label(482, 407, 'UKG')}
      ${person(459, 'Mother’s Name:', q?.motherName, q?.motherOccupation, q?.motherPhone, q?.motherEmail, q?.motherAddress)}
      ${person(721, 'Father’s Name:', q?.fatherName, q?.fatherOccupation, q?.fatherPhone, q?.fatherEmail, q?.fatherAddress)}
      ${person(983, 'Guardian&nbsp; Name:', q?.guardianName, q?.guardianOccupation, q?.guardianPhone, false, q?.guardianAddress)}
      ${label(46, 1177, 'Where did you get to know about “ School ”')}
      ${label(46, 1210, 'Advertisement', ' sm')}${tick(160, 1196, heard.has('Advertisement'))}
      ${label(224, 1210, 'Friends', ' sm')}${tick(285, 1196, heard.has('Friends'))}
      ${label(339, 1210, 'Facebook', ' sm')}${tick(417, 1196, heard.has('Facebook'))}
      ${label(470, 1210, 'Leaflet', ' sm')}${tick(526, 1196, heard.has('Leaflet'))}
      ${label(577, 1210, 'Hoardings', ' sm')}${tick(660, 1196, heard.has('Hoardings'))}
      ${label(710, 1210, 'Others', ' sm')}${tick(765, 1196, heard.has('Others'))}
    </div></section>`;

  const notes = (q?.feedback ?? []).map(f =>
    `<tr><td class="d">${e(dmy(f.feedbackOn))}</td><td>${e(f.note)}${f.createdBy ? `<small> — ${e(f.createdBy)}</small>` : ''}</td></tr>`).join('');
  const page2 = `
    <section class="sheet"><div class="frame"><div class="bd"></div>
      <div class="fbtitle">Enquiry Feedback</div>
      <table class="fb">
        <thead><tr><th class="d">Date</th><th>Discussion &amp; Feedback</th></tr></thead>
        <tbody>${notes}<tr class="fill"><td class="d"></td><td></td></tr></tbody>
      </table>
      <div class="lbl sig">Branch Head Signature</div>
      ${q ? `<div class="ref">Enquiry #${q.id} · ${e(dmy(q.createdOn))}${q.source ? ` · ${e(q.source)}` : ''}</div>` : ''}
    </div></section>`;

  return page(`Enquiry Form${q ? ' — ' + e(q.childName) : ''}`, 'A4', 794, 1123, 920, 1300, `
    .bd { position: absolute; left: 8px; top: 8px; right: 8px; bottom: 10px; border: 12px solid #00aeef; }
    .head { position: absolute; left: 98px; top: 21px; width: 774px; }
    .lbl { position: absolute; transform: translateY(-50%); font: 700 19px Arial, Helvetica, sans-serif; color: #2c3e50; white-space: nowrap; }
    .lbl.sm { font-size: 16px; }
    .box { position: absolute; border: 1px solid #2c3e50; box-sizing: border-box; display: flex; align-items: center;
      padding: 0 6px; overflow: hidden; font: 15px Arial, Helvetica, sans-serif; color: #111; white-space: nowrap; }
    .box span { overflow: hidden; text-overflow: ellipsis; }
    .chk { position: absolute; width: 28px; height: 28px; border: 1px solid #2c3e50; box-sizing: border-box;
      display: grid; place-items: center; font: 700 22px Arial, sans-serif; color: #111; }
    .cells { position: absolute; display: flex; height: 28px; border-left: 1px solid #2c3e50; }
    .cells i { width: 28.1px; height: 28px; box-sizing: border-box; border: 1px solid #2c3e50; border-left: 0;
      display: grid; place-items: center; font: normal 16px Arial, sans-serif; color: #111; }
    .fbtitle { position: absolute; left: 335px; top: 32px; width: 253px; height: 55px; border: 1px solid #2c3e50; box-sizing: border-box;
      display: grid; place-items: center; font: 700 22px Arial, sans-serif; color: #2c3e50; }
    table.fb { position: absolute; left: 57px; top: 105px; width: 809px; height: 602px; border-collapse: collapse; table-layout: fixed;
      font: 15px Arial, sans-serif; color: #111; }
    .fb th, .fb td { border: 1px solid #222; padding: 6px 8px; vertical-align: top; text-align: left; }
    .fb th { height: 41px; vertical-align: middle; text-align: center; font: 700 28px Arial, sans-serif; color: #2c3e50; }
    .fb th.d { font-size: 22px; }
    .fb .d { width: 93px; }
    .fb tr:not(.fill) td { border-bottom: 0; border-top: 0; }
    .fb tr.fill td { height: 100%; border-top: 0; }
    .fb small { color: #555; }
    .sig { left: 561px; top: 840px; font-size: 22px; transform: none; }
    .ref { position: absolute; right: 30px; bottom: 16px; font: 11px Arial, sans-serif; color: #777; }
  `, only === 1 ? page1 : only === 2 ? page2 : page1 + page2);
}

/* ================================================================ receipt */

type Copy = 'parent' | 'office';

/** Rupees and paise for the receipt's two amount columns; nothing for a zero row. */
function split(n: number, always = false): [string, string] {
  if (!n && !always) return ['', ''];
  const sign = n < 0 ? '−' : '';
  const abs = Math.abs(n);
  const rupees = Math.floor(abs + 1e-9);
  const paise = Math.round((abs - rupees) * 100);
  return [sign + new Intl.NumberFormat('en-IN').format(rupees), `${paise}`.padStart(2, '0')];
}

/** One copy of the Fee Receipt, laid out on the artwork's 773 × 1045 card. */
function receiptCard(r: PreSchoolReceipt, copy: Copy): string {
  const sum = (pick: (l: PreSchoolReceipt['lines'][number]) => boolean) =>
    r.lines.filter(pick).reduce((t, l) => t + l.amount, 0);
  const charge = (head: string) => sum(l => l.kind === 'Charge' && l.chargeHead === head);

  const months = [...new Set(r.lines.filter(l => l.kind === 'Monthly' && l.forMonth).map(l => l.forMonth!))].sort().map(monthLabel);
  const othersNote = [
    charge('WinterGarments') ? 'Winter Garments' : '',
    r.lines.find(l => l.chargeHead === 'Others')?.description.split(' — ')[1] ?? ''
  ].filter(Boolean).join(', ');
  const lateNote = r.lines.find(l => l.chargeHead === 'LateFee')?.description.split(' — ')[1];

  const partOne: [string, string, number][] = [
    ['a.', 'Admission Fee', sum(l => l.kind === 'Admission')],
    ['b.', 'Registration Fee', charge('Registration')],
    ['c.', 'Annual Charges', charge('Annual')],
    ['d.', 'Activities Fee', charge('Activities')],
    ['e.', `Tuition Fee (Monthly)${months.length ? ` <small>— ${months.join(', ')}</small>` : ''}`, sum(l => l.kind === 'Monthly')],
    ['f.', `Late Fee/ Others (if any)${lateNote ? ` <small>— ${e(lateNote)}</small>` : ''}`, charge('LateFee')]
  ];
  const partTwo: [string, string, number][] = [
    ['g.', 'Prospectus', charge('Prospectus')],
    ['h.', 'Admission Kit', charge('AdmissionKit')],
    ['I.', 'Food Charges', charge('Food')],
    ['j.', 'Transport Charges', charge('Transport')],
    ['k.', `Others (if any)${othersNote ? ` <small>— ${e(othersNote)}</small>` : ''}`, charge('Others') + charge('WinterGarments')]
  ];
  const totalOne = partOne.reduce((t, [, , a]) => t + a, 0);

  const row = ([letter, text, amount]: [string, string, number]) => {
    const [rs, p] = split(amount);
    return `<tr><td class="l">${letter}</td><td class="t">${text}</td><td class="rs">${rs}</td><td class="p">${p}</td></tr>`;
  };
  const [t1, p1] = split(totalOne, true);
  const [gt, gp] = split(r.total, true);
  // Discount and special offer: their own "Less" lines above the Grand Total.
  const less = r.lines.filter(l => l.kind === 'Discount');
  const lessRows = less.map(l => {
    const [rs, p] = split(-l.amount, true);
    return `<tr class="less"><td class="l"></td><td class="t">Less: ${e(l.description)}</td><td class="rs">− ${rs}</td><td class="p">${p}</td></tr>`;
  }).join('');
  // The 13 printed rows fill 403 units; extra "Less" rows share that height, so the signature never moves.
  const rowHeight = (403 / (13 + less.length)).toFixed(2);

  const cheque = r.mode === 'Cheque' || r.mode === 'DD';
  const payNo = r.mode === 'Cash' ? 'Cash' : cheque ? (r.reference ?? '') : `${r.mode} ${r.reference ?? ''}`;
  const parents = [r.fatherName, r.motherName].filter(Boolean).join(' / ') || r.parentName;
  const [addr1, addr2] = twoLines(r.address, 70);

  // A value on a ruled line, its type shrunk just enough to fit the line rather than be cut off.
  const value = (left: number, top: number, width: number, text: string) => {
    const size = Math.max(9, Math.min(14, (width - 8) / (Math.max(text.length, 1) * 0.56)));
    return `<div class="fv" style="left:${left}px;top:${top}px;width:${width}px;font-size:${size.toFixed(1)}px">${e(text)}</div>`;
  };
  // Fields: a label, then a ruled line running to the given right edge, with the value written on it.
  const field = (x: number, y: number, labelText: string, lineFrom: number, lineTo: number, text = '') => `
    <div class="fl" style="left:${x}px;top:${y}px">${labelText}</div>${value(lineFrom, y, lineTo - lineFrom, text)}`;

  return `
    <div class="card ${copy}">
      <div class="small" style="left:42px;top:50px">Fee Receipt <b class="no">No. ${e(r.receiptCode)}</b></div>
      <div class="small right" style="top:${copy === 'parent' ? 45 : 50}px">${copy === 'parent' ? 'Parent Copy' : 'Office use only'}</div>
      <img class="head" src="${img('receipt-header.png')}" alt="Avijan Preschool, powered by My Chhota School">
      ${field(80, 285, 'Name of the Child :', 215, 697, r.childName)}
      ${field(81, 316, 'Admission No. :', 192, 513, r.admissionCode)}
      ${field(517, 316, 'Date :', 560, 697, dmy(r.receivedOn))}
      ${field(78, 347, 'Class :', 128, 388, r.className)}
      ${field(395, 347, 'Section :', 460, 697, r.section ?? '')}
      ${field(82, 378, 'Father’s/Mother’s Name :', 259, 697, parents)}
      ${field(80, 408, 'Address:', 145, 697, addr1)}
      ${value(78, 439, 209, addr2)}
      ${field(291, 439, 'Contact No. :', 383, 697, r.phone)}
      ${field(84, 469, 'Amount Received (in words) :', 295, 697, `Rupees ${r.totalInWords} only`)}
      ${field(79, 500, 'Cash/DD/Cheque No. :', 238, 322, payNo.trim())}
      ${field(326, 500, 'Dt:', 350, 452, cheque ? dmy(r.chequeDate) : '')}
      ${field(456, 500, 'Drawn on', 524, 697, cheque ? r.drawnOn ?? '' : '')}
      <table class="fees" style="--rh:${rowHeight}px">
        <tbody>
          <tr><td class="part" rowspan="7"><span>Part - I</span></td>${row(partOne[0]).slice(4)}
          ${partOne.slice(1).map(row).join('')}
          <tr class="sum"><td class="l"></td><td class="t"><span class="tot">Total</span></td><td class="rs">${t1}</td><td class="p">${p1}</td></tr>
          <tr><td class="part" rowspan="${6 + less.length}"><span>Part - II</span></td>${row(partTwo[0]).slice(4)}
          ${partTwo.slice(1).map(row).join('')}
          ${lessRows}
          <tr class="sum"><td class="l"></td><td class="t gt">Grand Total</td><td class="rs">${gt}</td><td class="p">${gp}</td></tr>
        </tbody>
      </table>
      ${copy === 'parent'
        ? '<div class="system">This is a system generated copy. No signature is required.</div>'
        : '<div class="sign">Authorised Signatory<br>Counsellor</div>'}
      ${r.isCancelled ? '<div class="void">CANCELLED</div>' : ''}
    </div>`;
}

const RECEIPT_CSS = `
  .card { position: absolute; width: 773px; height: 1045px; transform-origin: 0 0; font-family: Arial, Helvetica, sans-serif; color: #222; }
  .card.parent { background: #f8d4e5; }
  .card.office { background: #fff; outline: 1px solid #333; }
  .small { position: absolute; font-size: 14px; white-space: nowrap; }
  .small.right { right: 12px; }
  .small .no { font-weight: 700; margin-left: 12px; }
  .head { position: absolute; left: 118px; top: 66px; width: 621px; }
  .fl { position: absolute; transform: translateY(-50%); font-size: 15px; white-space: nowrap; }
  .fv { position: absolute; transform: translateY(-62%); height: 20px; border-bottom: 1.3px solid #222; box-sizing: border-box;
    padding: 0 4px; font-size: 14px; font-weight: 700; color: #0b2a6b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  table.fees { position: absolute; left: 76px; top: 535px; width: 621px; border-collapse: collapse; table-layout: fixed; font-size: 14px; }
  .fees td { border: 1.3px solid #222; height: var(--rh, 31px); padding: 0 8px; box-sizing: border-box; white-space: nowrap; overflow: hidden; }
  .fees td.part { width: 20px; padding: 0; position: relative; }
  .fees td.part span { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%) rotate(-90deg);
    font-weight: 700; font-size: 15px; white-space: nowrap; }
  .fees td.l { width: 28px; text-align: center; padding: 0; }
  .fees td.rs { width: 80px; text-align: right; font-weight: 700; color: #0b2a6b; }
  .fees td.p { width: 29px; text-align: center; padding: 0; font-weight: 700; color: #0b2a6b; }
  .fees td.t small { font-size: 11px; color: #444; }
  .fees tr.sum td.t { padding: 0; position: relative; }
  .fees .tot { position: absolute; right: 0; top: -1px; bottom: -1px; width: 53px; border-left: 1.3px solid #222;
    display: flex; align-items: center; justify-content: flex-end; padding-right: 6px; box-sizing: border-box; font-size: 15px; }
  .fees td.gt { text-align: right; padding-right: 6px; font-size: 15px; }
  .fees tr.less td.t { text-align: right; padding-right: 6px; font-style: italic; }
  .fees tr.less td.rs, .fees tr.less td.p { color: #b42318; }
  .sign { position: absolute; right: 76px; top: 990px; text-align: right; font-size: 15px; line-height: 1.15; }
  .system { position: absolute; left: 76px; right: 76px; top: 975px; padding: 8px 10px; border: 1.3px dashed #555; text-align: center;
    font-size: 14px; font-style: italic; color: #333; }
  .void { position: absolute; left: 50%; top: 52%; transform: translate(-50%, -50%) rotate(-18deg); font: 900 84px Arial, sans-serif;
    color: rgba(180, 35, 24, .2); border: 7px solid rgba(180, 35, 24, .2); padding: 2px 26px; border-radius: 14px; }
`;

/**
 * The Fee Receipt. 'pair' is the office print: one A4 sheet, landscape, with
 * the Parent copy and the Office copy side by side to cut apart. 'parent' is
 * the parent's copy alone on a half-A4 (A5) page — the one saved as PDF.
 */
export function feeReceiptHtml(r: PreSchoolReceipt, layout: 'pair' | 'parent'): string {
  // An A5 page is 559 × 794 px; the 773 × 1045 card is scaled to leave a printer's margin.
  const scale = 0.672;
  const left = (559 - 773 * scale) / 2;
  const top = (794 - 1045 * scale) / 2;
  const place = (copy: Copy, x: number) =>
    receiptCard(r, copy).replace('<div class="card', `<div style="--x:${x + left}px" class="card`);

  const body = layout === 'pair'
    ? `<section class="sheet">${place('parent', 0)}${place('office', 561)}<div class="cut"></div></section>`
    : `<section class="sheet">${place('parent', 0)}</section>`;

  return page(`Fee Receipt ${e(r.receiptCode)} — ${e(r.childName)}`, layout === 'pair' ? 'A4 landscape' : 'A5',
    layout === 'pair' ? 1123 : 559, 794, null, null, RECEIPT_CSS + `
    .card { left: var(--x); top: ${top}px; transform: scale(${scale}); }
    .cut { position: absolute; left: 561px; top: 0; bottom: 0; border-left: 1px dashed #999; }
    @media print { .cut { border-left-color: #ccc; } }
  `, body);
}

/* ================================================================== page */

/**
 * The document around the sheets: one fixed-size page per <section>, the
 * artwork-sized frame scaled onto it, a Print button on screen only.
 */
function page(title: string, size: string, w: number, h: number, artW: number | null, artH: number | null,
              css: string, sheets: string): string {
  const scaleFrame = artW && artH
    ? `.frame { position: absolute; left: 0; top: 0; width: ${artW}px; height: ${artH}px; box-sizing: border-box;
         transform: scale(${w / artW}); transform-origin: 0 0; background: #fff; }`
    : '';
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  @page { size: ${size}; margin: 0; }
  html, body { margin: 0; padding: 0; }
  body { background: #e9ebf1; }
  .sheet { position: relative; width: ${w}px; height: ${h}px; margin: 16px auto; background: #fff; overflow: hidden;
    box-shadow: 0 4px 18px rgba(0,0,0,.12); page-break-after: always; break-after: page; }
  .sheet:last-of-type { page-break-after: auto; break-after: auto; }
  ${scaleFrame}
  ${css}
  .print-btn { display: block; margin: 8px auto 24px; font: 600 14px 'Segoe UI', Arial; padding: 10px 24px; border: 0;
    border-radius: 999px; background: #ff6b8b; color: #fff; cursor: pointer; }
  @media print { body { background: #fff; } .sheet { margin: 0; box-shadow: none; } .print-btn { display: none; } }
</style></head>
<body>
${sheets}
<button class="print-btn" onclick="window.print()">Print</button>
</body></html>`;
}
