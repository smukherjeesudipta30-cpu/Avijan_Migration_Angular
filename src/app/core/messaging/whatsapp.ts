import { AdmissionReceipt } from '../models/student.model';
import { FeeReceipt } from '../models/fee.model';

/**
 * Sending a bill to a student on WhatsApp.
 *
 * This uses WhatsApp's own click-to-chat link (`wa.me`), which opens WhatsApp with
 * the message already typed and leaves a person to press Send.
 *
 * <p>That is a deliberate choice, not a shortcut. Sending automatically needs the
 * WhatsApp Business Platform, which would require the institute's number
 * (7688045949) to be migrated off ordinary WhatsApp — it could then no longer be
 * used in the WhatsApp app on a phone — plus Meta business verification, a
 * pre-approved message template for every kind of message, and a per-message fee.
 * Click-to-chat costs nothing, needs no approval, and leaves the number working
 * normally.</p>
 *
 * <p>Automating it through an unofficial library that drives WhatsApp Web is the
 * other thing people do, and it is not done here: it breaks WhatsApp's terms and
 * gets numbers banned. Losing the institute's public number would be a far worse
 * outcome than a receptionist pressing Send.</p>
 *
 * <p>The message text and the number formatting live here rather than in the
 * screens, so that if the official API is adopted later the same two functions
 * feed it and nothing has to be rewritten.</p>
 */

/** India. The stored numbers are local 10-digit ones with no country code. */
const COUNTRY_CODE = '91';

/**
 * Turns a stored phone number into the digits `wa.me` expects, or null when it
 * cannot be one.
 *
 * The migrated data holds numbers written by hand over many years — with spaces,
 * dashes, a `+91` prefix, or simply wrong. Three of the 244 active students have
 * something unusable, which is why this returns null rather than guessing: a
 * message sent to a mistyped number reaches a stranger.
 */
export function toWhatsAppNumber(phone?: string | null): string | null {
  if (!phone) return null;

  let digits = phone.replace(/\D/g, '');

  // "+91 98765 43210" and "0 98765 43210" both arrive here as 12 or 11 digits.
  if (digits.length === 12 && digits.startsWith(COUNTRY_CODE)) digits = digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);

  // An Indian mobile number is ten digits and never starts below 6.
  if (digits.length !== 10 || !/^[6-9]/.test(digits)) return null;

  return COUNTRY_CODE + digits;
}

/** True when this student can be messaged at all — drives the disabled state. */
export function canWhatsApp(phone?: string | null): boolean {
  return toWhatsAppNumber(phone) !== null;
}

/**
 * Opens WhatsApp with the message ready to send. Returns false when the browser
 * blocked the window, so the caller can say so rather than appearing to do nothing.
 */
/** Phones and tablets deep-link into the installed app; everything else is a desktop. */
function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(navigator.userAgent);
}

export function openWhatsApp(phone: string | null | undefined, message: string): boolean {
  const number = toWhatsAppNumber(phone);
  if (!number) return false;

  /* encodeURIComponent, not encodeURI: the message contains newlines and "&",
     which encodeURI leaves alone and which would then be read as part of the URL. */
  const text = encodeURIComponent(message);

  /* Two different links, because wa.me behaves differently on the two.
     ------------------------------------------------------------------
     On a DESKTOP, wa.me does not open a chat — it shows WhatsApp's own landing
     page with "Open app" and "Continue to WhatsApp Web", so the receptionist has
     to click twice more for every receipt. web.whatsapp.com/send skips that
     entirely and lands in the conversation, provided the browser has WhatsApp Web
     linked once from the counter's phone. If it is not linked it shows the QR
     page, which is the same thing wa.me would eventually have led to.

     On a PHONE, wa.me is the right one: it hands off to the installed app
     directly, and web.whatsapp.com would try to load the desktop client. */
  const url = isMobileDevice()
    ? `https://wa.me/${number}?text=${text}`
    : `https://web.whatsapp.com/send?phone=${number}&text=${text}`;

  return window.open(url, '_blank', 'noopener') !== null;
}

/* ------------------------------------------------------------- messages */

const HEADER = '*Avijan Computer Center*';
const FOOTER =
  'This is a computer generated bill. No signature is required.\n' +
  '53, Aghore Sarani, Rajpur, Kol-149 | Mob.: 7688045949';

/** Indian grouping, no symbol — as the printed receipts do it. */
function rupees(value?: number | null): string {
  return (value ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function shortDate(value?: string | null): string {
  return value
    ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
    : '-';
}

/**
 * Adds the "download the PDF" line.
 *
 * A click-to-chat link carries text and nothing else — an attachment is simply not
 * expressible in a `wa.me` URL — so the receipt travels as a link the student taps.
 * The URL is signed and expiring, and it is built by the server; the message never
 * assembles one, because guessing at the shape here would put a broken link in
 * front of a student the first time the route changed.
 */
function addPdfLink(lines: string[], pdfUrl?: string | null): void {
  if (!pdfUrl) return;

  lines.push('', 'Download your receipt (PDF):', pdfUrl);
}

/**
 * The admission receipt as a WhatsApp message.
 *
 * Plain text with WhatsApp's own `*bold*`: no HTML, and no attachment. A document
 * cannot be attached through a click-to-chat link — only text — so the figures are
 * in the message body where the student can read them without opening anything.
 */
export function admissionReceiptMessage(r: AdmissionReceipt): string {
  const lines = [
    HEADER,
    '_Admission Receipt_',
    '',
    `Dear ${r.name ?? 'Student'},`,
    'Your admission is confirmed. The details are below.',
    '',
    `*Bill No:* ${r.billNo ?? '-'}`,
    `*Registration No:* ${r.registrationId ?? '-'}`
  ];

  if (r.courseName) lines.push(`*Course:* ${r.courseName}`);

  lines.push(
    `*Date of Joining:* ${shortDate(r.dateOfJoining)}`,
    `*Admission Fees:* ${rupees(r.admissionFees)}`
  );

  if (r.admissionFeesInWords) lines.push(`*In Words:* ${r.admissionFeesInWords} Only`);

  lines.push(
    `*Next Payment Due:* ${shortDate(r.nextDueDate)}`,
    '',
    'Please keep your registration number safe - it is needed for fees, admit cards and certificates.',
  );

  addPdfLink(lines, r.pdfUrl);

  lines.push(
    '',
    FOOTER
  );

  return lines.join('\n');
}

/** The monthly money receipt as a WhatsApp message. */
export function feeReceiptMessage(r: FeeReceipt): string {
  const lines = [
    HEADER,
    '_Money Receipt_',
    '',
    `Dear ${r.studentName ?? 'Student'},`,
    'We have received your fee payment.',
    '',
    `*Bill No:* ${r.billNo ?? '-'}`,
    `*Registration No:* ${r.registrationId ?? '-'}`
  ];

  if (r.courseName) lines.push(`*Purpose:* ${r.courseName}`);

  lines.push(
    `*Date:* ${shortDate(r.feeDate)}`,
    `*Amount Paid:* ${rupees(r.amountPaid)}`
  );

  if (r.amountPaidInWords) lines.push(`*In Words:* ${r.amountPaidInWords} Only`);

  lines.push(`*Total Dues Until Today:* ${rupees(r.newDue)}`);

  if (r.nextDueDate) {
    lines.push(
      '',
      `Please clear your next month's fees by ${shortDate(r.nextDueDate)} to avoid a fine.`
    );
  }

  addPdfLink(lines, r.pdfUrl);

  lines.push('', FOOTER);

  return lines.join('\n');
}
