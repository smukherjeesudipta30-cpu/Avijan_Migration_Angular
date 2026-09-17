import { AdmitCard } from '../models/exam.model';
import { FeeReceipt } from '../models/fee.model';
import { HonorariumPayslip, StudentCertificate } from '../models/report.model';
import { AdmissionReceipt } from '../models/student.model';

/**
 * The four documents the institute hands a student on paper: the admission
 * receipt, the money receipt, the certificate and the exam admit card.
 *
 * Each reproduces its legacy layout — `Home/PrintReport.cshtml`,
 * `MonthlyCourseFees/PrintReport.cshtml`, `Home/PrintCertificate.cshtml` and
 * `Admit/PrintAdmit.cshtml` — because these are documents people already
 * recognise across a counter, and a redesign would make a genuine receipt look
 * unfamiliar.
 *
 * They live here rather than in the components because three screens print them
 * (fees, the student statement and the exam portal) and three copies of the same
 * markup would drift apart.
 *
 * The legacy pages rasterised themselves through html2canvas/html2pdf pulled from
 * a CDN, which produced a large soft bitmap. These print the markup instead: the
 * text stays sharp and selectable, and nothing is fetched from outside.
 */

/* ------------------------------------------------------------- helpers */

export function escapeHtml(value?: string | null): string {
  return (value ?? '').replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);
}

function shortDate(value?: string | null): string {
  return value
    ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '';
}

function shortTime(value?: string | null): string {
  return value
    ? new Date(value).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })
    : '';
}

/** Plain digits with Indian grouping — the legacy receipt printed no symbol. */
function rupees(value?: number | null): string {
  return (value ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

/**
 * Opens a document in its own window and writes the markup into it.
 * Returns false when the browser blocked the popup, so the caller can say so.
 *
 * Only safe to call synchronously, straight out of a click handler — see
 * `openPendingDocumentWindow` for the async case (fetching the document's
 * data before there is anything to write), which is what every caller in
 * this app actually needs.
 */
export function openDocumentWindow(html: string, width = 1000, height = 900): boolean {
  const win = openPendingDocumentWindow(width, height);

  if (!win) return false;

  return writeDocumentWindow(win, html);
}

/**
 * Opens a blank window right now, before the document's data has even been
 * asked for. Popup blockers key off whether window.open() runs inside the
 * call stack of a real click — a plain click handler still counts even
 * though Angular's own event dispatch sits in between, but the async gap
 * while an HTTP request for the document's data is in flight does not. Every
 * caller here used to open the window only after that request resolved,
 * which desktop browsers mostly forgive (hence the window merely opening
 * unfocused, fixed above) but mobile Chrome/Safari do not: they block the
 * popup outright, silently, with no error to catch and nothing for
 * `openDocumentWindow`'s null-check to report.
 *
 * The fix is to reserve the window up front, synchronously, and fill it in
 * once the data arrives with `writeDocumentWindow`. Call this as the very
 * first thing in the click handler.
 */
export function openPendingDocumentWindow(width = 1000, height = 900): Window | null {
  const win = window.open('', '_blank', `width=${width},height=${height}`);

  if (win) {
    // Blank tab/window shouldn't sit white and unlabelled while the request
    // it's waiting on is still in flight.
    win.document.write(
      '<!doctype html><title>Avijan</title><body style="font-family:Arial,Helvetica,sans-serif;' +
      'display:flex;align-items:center;justify-content:center;height:100vh;margin:0;' +
      'color:#6b7a99;">Preparing document&hellip;</body>'
    );
  }

  return win;
}

/**
 * Fills a window opened with `openPendingDocumentWindow` once the document's
 * data has arrived. Returns false if the window was never opened (blocked)
 * or the person has since closed it — in which case the caller should fall
 * back to `openDocumentWindow`, which at least reports the popup block.
 */
export function writeDocumentWindow(win: Window | null, html: string): boolean {
  if (!win || win.closed) return false;

  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();

  return true;
}

/**
 * Printed on the receipts in place of a signature line, and repeated word for word
 * in the emailed copies (see `SmtpStudentMailer.ComputerGenerated`). These bills are
 * issued by the system and never signed by hand, so saying so is what stops a
 * student or an auditor reading the absence of a signature as an omission.
 */
const COMPUTER_GENERATED = 'This is a computer generated bill. No signature is required.';


/**
 * An absolute URL for an image in `public/`.
 *
 * These documents are written into an `about:blank` popup. Browsers do give such a
 * window the opener's base URL, so a root-relative "/images/..." usually resolves -
 * but "usually" is not good enough for artwork on a document handed to a student,
 * so the origin is stated outright.
 */
function assetUrl(path: string): string {
  return `${window.location.origin}${path}`;
}

/**
 * Prints only once the artwork has actually loaded.
 *
 * `window.print()` on load is the obvious thing and it is wrong here: the markup is
 * injected with document.write, so the print dialog can open - and the sheet can be
 * rasterised - before the logo has arrived, which prints a receipt with a blank
 * space where the mark should be. The timeout is the backstop for an image that
 * never loads: a receipt without the logo still beats a window that never prints.
 */
const PRINT_WHEN_ARTWORK_READY = `
<script>
  (function () {
    var printed = false;
    function go() { if (!printed) { printed = true; window.focus(); window.print(); } }

    var images = Array.prototype.slice.call(document.images);
    var pending = images.filter(function (img) { return !img.complete; }).length;

    if (pending === 0) { setTimeout(go, 60); return; }

    images.forEach(function (img) {
      if (img.complete) return;
      var done = function () { if (--pending === 0) setTimeout(go, 60); };
      img.addEventListener('load', done);
      img.addEventListener('error', done);
    });

    setTimeout(go, 3000);
  })();
<\/script>`;

/* --------------------------------------------------- admission receipt */

/**
 * The admission receipt, handed over when a student is registered.
 *
 * Laid out as `Views/Home/PrintReport.cshtml` was: the same `Content/style1.css`
 * outline the money receipt uses - both legacy print views shared that stylesheet -
 * with the institute masthead above it and the Avijan mark at its head.
 *
 * It replaces a plain HTML table that had been written inline in the students
 * component. That table carried no logo, no address and none of the legacy framing,
 * so a printed admission receipt did not look like the institute's own paperwork.
 */
export function admissionReceiptHtml(receipt: AdmissionReceipt): string {
  const e = escapeHtml;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Avijan &mdash; Admission receipt ${e(receipt.registrationId)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #000; margin: 24px; }

  /* Kept from the legacy Content/style1.css, as on the money receipt. */
  #outline {
    width: 80%;
    margin: 0 auto;
    border: solid;
    padding: 10px 18px 18px;
    border-radius: 50px 20px;
  }

  #outline table { width: 100%; border-collapse: collapse; }
  #outline td { padding: 4px 6px; vertical-align: top; font-size: 15px; }

  /* At #outline specificity, or "#outline td" above wins and shrinks it. */
  #outline td.brand { font-size: 38px; font-weight: bold; line-height: 1.05; }

  .centre { text-align: center; }
  .right { text-align: right; }

  /* The bill and registration numbers are single tokens; letting the table break
     them mid-number turns "S-A-4988-26" into three lines when the masthead takes
     the width. */
  .no-wrap { white-space: nowrap; }

  .logo { display: block; margin: 0 auto 4px; width: 78px; height: auto; }
  .tagline { font-size: 13px; letter-spacing: 0.02em; }

  .rule { border: 0; border-top: 2px solid #000; margin: 10px 0 4px; }

  .doc-title {
    text-align: center;
    font-size: 17px;
    font-weight: bold;
    letter-spacing: 0.14em;
    margin: 2px 0 10px;
  }

  /* The detail rows: label left, value right, ruled like the legacy receipt. */
  .details td { border-bottom: 1px solid #999; padding: 7px 6px; }
  .details td.label { width: 42%; font-weight: bold; }

  .words { margin-top: 14px; font-size: 15px; font-weight: bold; }
  /* The receipt is issued by the system and never signed, so the note takes the
     place of the signature line rather than leaving an empty space that looks
     like an unfinished document. */
  .computer-generated {
    margin: 34px 0 0;
    text-align: center;
    font-size: 13px;
    font-style: italic;
  }

  .print-link { display: block; text-align: center; margin-top: 18px; font-size: 14px; }

  @media print {
    body { margin: 10mm; }
    .print-link { display: none; }
  }
</style></head>
<body>
  <div id="outline">
    <table>
      <tr>
        <td colspan="3" class="centre">
          <img class="logo" src="${assetUrl('/images/file_trans.png')}" alt="Avijan">
        </td>
      </tr>
      <tr>
        <td class="no-wrap"><b>Bill No: <span>${e(receipt.billNo)}</span></b></td>
        <td class="centre brand">AVIJAN</td>
        <td class="right no-wrap"><b>Reg No: <span>${e(receipt.registrationId)}</span></b></td>
      </tr>
      <tr>
        <td></td>
        <td class="centre tagline"><b>AN UNIT OF COMPUTER PROFESSIONALS &amp; LEARNERS</b></td>
        <td></td>
      </tr>
      <tr>
        <td></td>
        <td class="centre"><b>Rajpur. Opp. Of Bangla School, Kolkata - 700149</b></td>
        <td></td>
      </tr>
      <tr>
        <td></td>
        <td class="centre"><b>Mob.: 7688045949</b></td>
        <td></td>
      </tr>
    </table>

    <hr class="rule">
    <p class="doc-title">ADMISSION RECEIPT</p>

    <table class="details">
      <tr><td class="label">Name</td><td>${e(receipt.name)}</td></tr>
      <tr><td class="label">Course</td><td>${e(receipt.courseName)}</td></tr>
      <tr><td class="label">Date of Joining</td><td>${shortDate(receipt.dateOfJoining)}</td></tr>
      <tr><td class="label">Admission Fees</td><td>${rupees(receipt.admissionFees)}</td></tr>
      <tr><td class="label">Next Payment Due</td><td>${shortDate(receipt.nextDueDate)}</td></tr>
    </table>

    <p class="words">Pay in word: ${e(receipt.admissionFeesInWords)} Only</p>

    <p class="computer-generated">${COMPUTER_GENERATED}</p>
  </div>

  <a class="print-link" href="javascript:window.print()">Click to Print This Page</a>
  ${PRINT_WHEN_ARTWORK_READY}
</body></html>`;
}

/* ------------------------------------------------------- money receipt */

/**
 * The money receipt, as `Views/MonthlyCourseFees/PrintReport.cshtml` laid it out:
 * the rounded double-radius outline from `Content/style1.css`, AVIJAN across the
 * top between the bill and registration numbers, the Rajpur address and mobile,
 * and the fine warning at the foot.
 */
export function moneyReceiptHtml(receipt: FeeReceipt): string {
  const e = escapeHtml;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Avijan &mdash; Money receipt ${e(receipt.billNo)}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #000; margin: 24px; }

  /* Kept from the legacy Content/style1.css. */
  #outline {
    width: 80%;
    margin: 0 auto;
    border: solid;
    padding: 10px;
    border-radius: 50px 20px;
  }

  #outline table { width: 100%; border-collapse: collapse; }
  #outline td { padding: 4px 6px; vertical-align: top; font-size: 15px; }

  /* Kept at #outline specificity: a bare .brand loses to "#outline td" above,
     which would quietly shrink the masthead back to body size. */
  #outline td.brand { font-size: 40px; font-weight: bold; line-height: 1.1; }

  .centre { text-align: center; }
  .right { text-align: right; }
  .warn { font-weight: bold; }

  .print-link { display: block; text-align: center; margin-top: 18px; font-size: 14px; }

  @media print {
    body { margin: 10mm; }
    .print-link { display: none; }
  }
</style></head>
<body>
  <div id="outline">
    <table>
      <tr>
        <td><b>Bill No: <span>${e(receipt.billNo)}</span></b></td>
        <td class="centre brand">AVIJAN</td>
        <td class="right"><b>Reg No: <span>${e(receipt.registrationId)}</span></b></td>
      </tr>
      <tr>
        <td></td>
        <td class="centre"><b>Rajpur. Opp. Of Bangla School, Kolkata - 700149</b></td>
        <td></td>
      </tr>
      <tr>
        <td></td>
        <td class="centre"><b>Mob.: 7688045949</b></td>
        <td></td>
      </tr>
    </table>

    <table>
      <tr>
        <td><b>Name : <span>${e(receipt.studentName)}</span></b></td>
        <td><b>Purpose: <span>${e(receipt.courseName)}</span></b></td>
      </tr>
      <tr>
        <td><b>Pay in Rupees: <span>${rupees(receipt.amountPaid)}</span></b></td>
        <td><b>Pay in word: <span>${e(receipt.amountPaidInWords)} Only</span></b></td>
      </tr>
      <tr>
        <td colspan="2">
          <b>Total Dues Until Today(in Rupees): <span>${rupees(receipt.newDue)}</span></b>
        </td>
      </tr>
    </table>

    <br>

    <table>
      <tr>
        <td><b>Date: <span>${shortDate(receipt.feeDate)}</span></b></td>
        <td class="right"><i>${COMPUTER_GENERATED}</i></td>
      </tr>
      <tr>
        <td colspan="2" class="centre warn">
          ****Please Try to Clear Your Next Month Fees within
          <span>${shortDate(receipt.nextDueDate)}</span> To Avoid Fine****
        </td>
      </tr>
    </table>
  </div>

  <a class="print-link" href="javascript:window.print()">Click to Print This Page</a>
</body></html>`;
}

/* --------------------------------------------------------- certificate */

/**
 * The certificate, as `Views/Home/PrintCertificate.cshtml` laid it out: the A4
 * landscape artwork with the details written over it in Lucida Handwriting at
 * 280px down and 150px in from either side.
 */
export function certificateHtml(c: StudentCertificate): string {
  const e = escapeHtml;

  const line = (label: string, value: string) => `
      <tr>
        <td class="label">${label}</td>
        <td class="value">${value}</td>
      </tr>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Avijan Certificate &mdash; ${e(c.studentName)}</title>
<style>
  @page { size: A4 landscape; margin: 0; }

  body { margin: 0; background: #f5f5f5; }

  #certificate {
    position: relative;
    width: 1122px;
    height: 794px;
    margin: 0 auto;
  }

  #mean { position: absolute; top: 0; left: 0; }
  #mean img { width: 1122px; height: 794px; }

  #certificatedescribtion {
    position: absolute;
    top: 280px;
    left: 150px;
    right: 150px;
  }

  #certificatedescribtion table { border-collapse: collapse; }
  #certificatedescribtion td { padding: 2px 6px; vertical-align: bottom; }

  .label {
    color: #003399;
    font-family: 'Lucida Handwriting', 'Segoe Script', cursive;
    white-space: nowrap;
  }

  .value {
    min-width: 320px;
    font-family: 'Lucida Handwriting', 'Segoe Script', cursive;
    color: #111;
  }

  /* Duplicate marking. Sits over the artwork, angled and semi-transparent, so
     it cannot be mistaken for part of the design and cannot be cropped off
     without taking the certificate body with it. */
  .dup-watermark {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-28deg);
    font-family: Arial, Helvetica, sans-serif;
    font-size: 96px;
    font-weight: bold;
    letter-spacing: 12px;
    color: rgba(190, 30, 45, 0.22);
    border: 6px solid rgba(190, 30, 45, 0.22);
    padding: 10px 34px;
    white-space: nowrap;
    pointer-events: none;
  }

  /* The copy number, stated plainly rather than only implied by the mark. */
  .dup-stamp {
    position: absolute;
    top: 18px;
    right: 26px;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 13px;
    font-weight: bold;
    line-height: 1.5;
    color: #be1e2d;
    text-align: right;
  }

  .dup-stamp span { display: block; font-weight: normal; font-size: 11px; }

  .print-btn {
    display: block;
    margin: 18px auto;
    padding: 10px 22px;
    font-size: 15px;
    font-weight: bold;
    cursor: pointer;
  }

  .provisional {
    width: 1122px;
    margin: 0 auto;
    text-align: center;
    color: #b45309;
    font-family: Arial, sans-serif;
    font-size: 13px;
  }

  @media print {
    body { background: #fff; }
    .print-btn { display: none; }
  }
</style></head>
<body>
  <div id="certificate">
    <div id="mean">
      <img src="/images/SAVE_20191128_212413.jpeg" alt="">
    </div>

    ${c.isDuplicate ? `
    <div class="dup-watermark">DUPLICATE COPY</div>
    <div class="dup-stamp">
      DUPLICATE COPY &mdash; No. ${c.issueNo}
      <span>Copy ${c.issueNo} of ${c.issueNo} issued to date</span>
      ${c.originalIssuedOn
        ? `<span>Original issued ${shortDate(c.originalIssuedOn)}</span>`
        : ''}
    </div>` : ''}

    <div id="certificatedescribtion">
      <table>
        ${line('This is certify that', e(c.studentName))}
        ${line('son/daughter/wife of', e(c.guardianName))}
        ${line('Reg No.', e(c.registrationId))}
        ${line('Residing of', 'Avijan')}
        ${line('Appeared from', 'Avijan')}
        ${line('Successfully completed the course', e(c.courseName))}
        ${line('for', c.courseDuration ? `${c.courseDuration} Months` : '')}
        ${line('from date', shortDate(c.dateOfJoining))}
        ${line('to date', shortDate(c.examDate))}
        ${line('with', `${e(c.grade)} <span class="label">Grade</span>`)}
      </table>
    </div>
  </div>

  ${c.isComplete
    ? ''
    : '<p class="provisional">Provisional &mdash; the course is not yet marked complete.</p>'}

  <button class="print-btn" onclick="window.print()">Print / Save PDF</button>
</body></html>`;
}

/* ----------------------------------------------------------- admit card */

/**
 * The exam admit card, as `Views/Admit/PrintAdmit.cshtml` laid it out: the
 * vertical blue-and-gold panel, the header with the logo, and the
 * Theory / Practical table.
 *
 * The legacy card left the Date and Time cells blank to be filled in by hand.
 * They now carry the sitting the institute set for this student, which is what
 * made the card worth issuing per student in the first place.
 *
 * Two copies to a sheet with a cut line between them, as the legacy PDF made.
 * The access code is deliberately absent: it is read out at the desk, never
 * printed on something the student takes home.
 *
 * The legacy card also carried a "Signature of Examiner" column and a
 * Student / Authority signature line at the foot, for the office to fill in
 * and stamp by hand once printed. This card needs neither: it is generated
 * straight from the schedule the office set (the Practical row updates itself
 * the moment that date is entered, with nothing to reprint), so it says as
 * much instead of leaving blanks nobody is meant to sign.
 */
export function admitCardHtml(card: AdmitCard): string {
  const e = escapeHtml;

  const row = (label: string, scheduledOn?: string) => `
      <tr>
        <td>${label}</td>
        <td>${shortDate(scheduledOn) || '&nbsp;'}</td>
        <td>${shortTime(scheduledOn) || '&nbsp;'}</td>
      </tr>`;

  const body = `
    <div class="admit-card">
      <div class="left-panel">
        <div class="panel-bg"></div>
        <p>EXAM ADMIT CARD</p>
      </div>

      <div class="main-content">
        <div class="header">
          <div class="title">
            <h1>AVIJAN COMPUTER CENTRE</h1>
            <p>AN UNIT OF COMPUTER PROFESSIONALS &amp; LEARNERS</p>
            <p class="call">CALL: 76880 45949</p>
          </div>
          <div class="logo">
            <img src="/images/file_trans.png" alt="Avijan Logo">
          </div>
        </div>

        <div class="exam-info">
          <label>Name:</label> <span>${e(card.studentName)}</span><br>
          <label>Registration Number:</label> <span>${e(card.registrationId)}</span><br>
          <label>Course:</label> <span>${e(card.courseName)}</span><br>
          <label>Guardian Name:</label> <span>${e(card.guardianName)}</span><br>
        </div>

        <table>
          <thead>
            <tr>
              <th>Examination</th>
              <th>Date</th>
              <th>Time</th>
            </tr>
          </thead>
          <tbody>
            ${row('Theory', card.theory.scheduledOn)}
            ${row('Practical', card.practical.scheduledOn)}
          </tbody>
        </table>

        <div class="system-generated">
          &#10003; This is a system-generated admit card. No signature is required.
        </div>
      </div>
    </div>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Exam Admit Card &mdash; ${e(card.studentName)}</title>
<style>
  body { font-family: Arial, sans-serif; margin: 0; padding: 24px; background: #f5f5f5; }

  .admit-card {
    display: flex;
    width: 950px;
    margin: 0 auto;
    background: #fff;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
    border-radius: 8px;
    overflow: hidden;
    border: 3px solid #003366;
    position: relative;
  }

  .left-panel {
    position: relative;
    width: 120px;
    flex: 0 0 120px;
    background: linear-gradient(to bottom, #003366, #FFD700);
    display: flex;
    align-items: center;
    justify-content: center;
    writing-mode: vertical-rl;
    text-orientation: upright;
    font-size: 22px;
    font-weight: bold;
    color: #fff;
    letter-spacing: 2px;
    padding: 10px;
  }

  .panel-bg {
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, #FFD700, #003366);
    clip-path: ellipse(50% 100% at 50% 0%);
    opacity: 0.5;
    z-index: -1;
  }

  .main-content { flex-grow: 1; padding: 20px; min-width: 0; }

  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: linear-gradient(to right, #003366, #FFD700);
    color: #fff;
    padding: 15px;
    border-radius: 8px 8px 0 0;
  }

  .logo img { width: 80px; height: auto; margin-left: 15px; }

  .title { flex-grow: 1; text-align: center; }
  .title h1 {
    font-size: 22px; margin: 0; font-weight: bold;
    text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
  }
  .title p { margin: 5px 0; font-size: 14px; font-weight: bold; }
  .call { font-weight: bold; font-size: 16px; }

  .exam-info {
    padding: 20px;
    font-size: 16px;
    line-height: 2;
    background: linear-gradient(to right, #f0f0f0, #ffffff);
    border-radius: 5px;
  }
  .exam-info label { font-weight: bold; }

  table { width: 100%; margin-top: 20px; border-collapse: collapse; }
  table, th, td { border: 1px solid #000; text-align: center; padding: 10px; }
  th { background: #003366; color: #fff; font-size: 14px; letter-spacing: 1px; }
  td { height: 22px; }

  .system-generated {
    margin-top: 48px;
    padding: 12px 16px;
    border: 1px dashed #003366;
    border-radius: 6px;
    background: #f0f4f8;
    color: #003366;
    font-size: 14px;
    font-style: italic;
    text-align: center;
  }

  .cut {
    width: 950px;
    margin: 26px auto;
    border-top: 2px dashed #666;
    text-align: center;
    color: #666;
    font-size: 13px;
  }
  .cut span { position: relative; top: -10px; background: #f5f5f5; padding: 0 10px; }

  .print-btn {
    display: block;
    width: 200px;
    padding: 12px;
    font-size: 18px;
    font-weight: bold;
    color: #fff;
    background: linear-gradient(45deg, #003366, #FFD700);
    border: none;
    border-radius: 30px;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.3);
    cursor: pointer;
    margin: 26px auto;
  }

  @media print {
    body { background: #fff; padding: 0; }
    .print-btn { display: none; }
    .admit-card { box-shadow: none; }
    .cut span { background: #fff; }
  }
</style></head>
<body>
  ${body}
  <div class="cut"><span>&#9986; cut here</span></div>
  ${body}
  <button class="print-btn" onclick="window.print()">Print / Save PDF</button>
</body></html>`;
}

/* ------------------------------------------------------------ pay slip */

function monthYear(value: string): string {
  const d = new Date(value);
  return isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

/**
 * A teacher or receptionist's monthly honorarium pay slip. Unlike the other
 * documents here this has no legacy page to reproduce — the institute never
 * issued one on paper — so it is laid out fresh, in the same masthead style as
 * the money receipt, rather than borrowed from a `.cshtml` view that doesn't
 * exist.
 */
export function honorariumPayslipHtml(slip: HonorariumPayslip): string {
  const e = escapeHtml;
  const role = slip.staffRole === 'Teacher' ? 'Teacher' : 'Receptionist';

  const paidOnText = slip.paidOn.length
    ? slip.paidOn.map(d => shortDate(d)).join(', ')
    : '&mdash;';

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>Avijan &mdash; Pay slip ${e(slip.staffName ?? '')} ${e(monthYear(slip.payMonth))}</title>
<style>
  body { font-family: Arial, Helvetica, sans-serif; color: #14213d; margin: 24px; background: #f5f5f5; }

  #slip {
    width: 680px;
    margin: 0 auto;
    background: #fff;
    border: 1px solid #d7dce5;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 6px 18px rgba(20, 33, 61, 0.08);
  }

  .head {
    padding: 26px 32px 22px;
    background: linear-gradient(135deg, #0b2545, #144272);
    color: #fff;
  }

  .head .brand { font-size: 26px; font-weight: 800; letter-spacing: 0.06em; margin: 0; }
  .head .sub { margin: 3px 0 0; font-size: 12.5px; opacity: 0.85; }
  .head .doc-title {
    margin: 16px 0 0;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    opacity: 0.95;
  }

  .body { padding: 26px 32px 8px; }

  .staff-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px 24px;
    padding-bottom: 18px;
    margin-bottom: 18px;
    border-bottom: 1px dashed #cbd3e0;
  }

  .staff-grid .field span.k {
    display: block;
    font-size: 10.5px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: #6b7a99;
  }

  .staff-grid .field span.v { display: block; font-size: 14.5px; font-weight: 600; margin-top: 2px; }

  table.pay { width: 100%; border-collapse: collapse; margin-bottom: 6px; }

  table.pay td { padding: 10px 4px; font-size: 14px; border-bottom: 1px solid #eef1f6; }

  table.pay td.label { color: #4a5568; }
  table.pay td.amount { text-align: right; font-variant-numeric: tabular-nums; }

  table.pay tr.total td {
    border-bottom: none;
    border-top: 2px solid #0b2545;
    padding-top: 14px;
    font-size: 17px;
    font-weight: 800;
  }

  .notes { margin: 14px 0 0; padding: 10px 12px; background: #f4f6fb; border-radius: 6px; font-size: 12.5px; color: #4a5568; }

  .foot {
    padding: 18px 32px 26px;
    text-align: center;
    font-size: 12px;
    color: #6b7a99;
  }

  .foot .system-note { font-weight: 700; color: #0b2545; margin: 0 0 4px; }
  .foot .generated { margin: 2px 0 0; }

  .print-link { display: block; text-align: center; margin: 18px 0 4px; font-size: 14px; }

  @media print {
    body { background: #fff; margin: 0; }
    #slip { box-shadow: none; border: none; width: 100%; }
    .print-link { display: none; }
  }
</style></head>
<body>
  <div id="slip">
    <div class="head">
      <p class="brand">AVIJAN COMPUTER CENTRE</p>
      <p class="sub">Rajpur. Opp. Of Bangla School, Kolkata - 700149 &middot; Mob.: 7688045949</p>
      <p class="sub sub--reg">ISO 9001:2015 Certified Institution &middot; MSME Affiliated</p>
      <p class="doc-title">Honorarium Pay Slip &mdash; ${e(monthYear(slip.payMonth))}</p>
    </div>

    <div class="body">
      <div class="staff-grid">
        <div class="field">
          <span class="k">Name</span>
          <span class="v">${e(slip.staffName)}</span>
        </div>
        <div class="field">
          <span class="k">Role</span>
          <span class="v">${role}${slip.designation ? ` &mdash; ${e(slip.designation)}` : ''}</span>
        </div>
        <div class="field">
          <span class="k">Branch</span>
          <span class="v">${e(slip.branch) || '&mdash;'}</span>
        </div>
        <div class="field">
          <span class="k">Pay period</span>
          <span class="v">${e(monthYear(slip.payMonth))}</span>
        </div>
      </div>

      <table class="pay">
        <tr>
          <td class="label">Honorarium for ${e(monthYear(slip.payMonth))}</td>
          <td class="amount">&#8377; ${rupees(slip.amount)}</td>
        </tr>
        <tr>
          <td class="label">Paid on</td>
          <td class="amount">${paidOnText}</td>
        </tr>
        <tr class="total">
          <td>Net amount paid</td>
          <td class="amount">&#8377; ${rupees(slip.amount)}</td>
        </tr>
      </table>

      ${slip.notes ? `<p class="notes">${e(slip.notes)}</p>` : ''}
    </div>

    <div class="foot">
      <p class="system-note">It is system generated, no need to signature</p>
      <p class="generated">Generated on ${shortDate(slip.generatedOn)}</p>
    </div>
  </div>

  <a class="print-link" href="javascript:window.print()">Click to Print This Page</a>
</body></html>`;
}
