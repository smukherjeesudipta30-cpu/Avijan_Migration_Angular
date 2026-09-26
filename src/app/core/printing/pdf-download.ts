import { AdmitCard } from '../models/exam.model';
import { StudentCertificate } from '../models/report.model';
import { admitCardHtml, certificateHtml } from './legacy-documents';

/**
 * Turns one of the legacy print documents (certificate, admit card) into a
 * real PDF file, so it is actually saved rather than depending on a popup and
 * a print dialog.
 *
 * The markup is rendered in an off-screen iframe - the same HTML the print
 * window shows, so the PDF and the printout never drift apart - rasterised
 * with html2canvas and placed on one A4 page, and the file downloads straight
 * away.
 */
export async function downloadDocumentPdf(
  html: string,
  fileName: string,
  options: { width: number; landscape?: boolean }
): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText =
    `position:fixed;left:-10000px;top:0;width:${options.width}px;height:1200px;border:0;visibility:hidden;`;
  document.body.appendChild(frame);

  try {
    const doc = frame.contentDocument!;
    // Without the auto-print script and the on-screen print button: neither
    // belongs in a saved file.
    doc.open();
    doc.write(html.replace(/<script[\s\S]*?<\/script>/gi, ''));
    doc.close();
    doc.querySelectorAll('.print-btn, .print-link').forEach(el => el.remove());
    doc.body.style.background = '#fff';

    await waitForImages(doc);

    // Shrink-wrap the frame to the document so the page is not padded with
    // blank space below it (which would also scale the artwork down).
    frame.style.height = '10px';
    const height = Math.max(doc.documentElement.scrollHeight, doc.body.scrollHeight);
    frame.style.height = `${height}px`;

    const canvas = await html2canvas(doc.body, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
      width: options.width,
      height,
      windowWidth: options.width,
      windowHeight: height
    });

    const pdf = new jsPDF({ orientation: options.landscape ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
    const w = canvas.width * ratio;
    const h = canvas.height * ratio;
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', (pageW - w) / 2, 0, w, h);

    pdf.save(fileName);
  } finally {
    frame.remove();
  }
}

/** Resolves once every image has loaded or failed - capped, so a dead image cannot hang the download. */
function waitForImages(doc: Document): Promise<void> {
  const pending = Array.from(doc.images).filter(img => !img.complete);
  const loaded = Promise.all(
    pending.map(img => new Promise<void>(resolve => {
      img.addEventListener('load', () => resolve());
      img.addEventListener('error', () => resolve());
    }))
  );
  return Promise.race([loaded.then(() => undefined), new Promise<void>(r => setTimeout(r, 4000))]);
}

/** A file name safe on Windows and Android alike. */
export function pdfFileName(prefix: string, ...parts: (string | number | null | undefined)[]): string {
  const tail = parts
    .filter(p => p !== null && p !== undefined && `${p}`.trim() !== '')
    .map(p => `${p}`.trim().replace(/[^A-Za-z0-9-]+/g, '_'))
    .join('_');
  return `${prefix}${tail ? '_' + tail : ''}.pdf`;
}

/** Always false on the website; the app's copy of this file says otherwise. */
export function isNativeApp(): boolean {
  return false;
}

/** The certificate as a saved PDF - A4 landscape, like the printed one. */
export function saveCertificatePdf(c: StudentCertificate): Promise<void> {
  const copy = c.issueNo > 1 ? `copy${c.issueNo}` : null;
  return downloadDocumentPdf(
    certificateHtml(c), pdfFileName('Certificate', c.registrationId, copy), { width: 1122, landscape: true });
}

/** The admit card as a saved PDF - A4 portrait. */
export function saveAdmitCardPdf(card: AdmitCard): Promise<void> {
  return downloadDocumentPdf(
    admitCardHtml(card), pdfFileName('AdmitCard', card.registrationId, card.courseName), { width: 900 });
}
