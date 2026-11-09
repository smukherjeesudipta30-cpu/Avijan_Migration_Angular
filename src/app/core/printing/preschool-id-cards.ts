import type { jsPDF as JsPdf } from 'jspdf';
import { toDataURL } from 'qrcode';

import { PreSchoolStudentDetail, PreSchoolStudentPhotos } from '../models/preschool-student.model';

/** ATM / bank-card size (ISO 7810 ID-1, "CR80"), in millimetres. */
const CARD_W = 85.6;
const CARD_H = 54;

export interface PreSchoolIdCardSchool {
  name: string;
  address?: string | null;
  phone?: string | null;
}

type Rgb = [number, number, number];
const PINK: Rgb = [255, 107, 139];
const VIOLET: Rgb = [109, 40, 217];
const TEAL: Rgb = [13, 148, 136];
const INK: Rgb = [42, 47, 69];
const MUTED: Rgb = [110, 115, 135];

interface CardPerson {
  kind: 'STUDENT' | 'GUARDIAN 1' | 'GUARDIAN 2';
  colour: Rgb;
  name: string;
  photo: string | null;
  /** Label / value rows beside the photo. */
  rows: [string, string][];
  /** One line above the footer. */
  note: string;
}

/**
 * A PDF of three ID cards for one PreSchool child, one card to a page at the
 * size of an ATM card: the child's own, and one for each of the two guardians
 * allowed to collect them. Printed on card stock (or PVC) at 100% scale, each
 * page is one card ready to cut or laminate.
 *
 * A guardian not filled in on the form gets a card with blank lines, to be
 * written in by hand.
 */
export async function downloadPreSchoolIdCards(
  s: PreSchoolStudentDetail, photos: PreSchoolStudentPhotos, school: PreSchoolIdCardSchool): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: [CARD_H, CARD_W], compress: true });

  const childLine = `${s.childName} · ${s.className}`;
  const dob = formatDate(s.dateOfBirth);
  const cards: CardPerson[] = [
    {
      kind: 'STUDENT', colour: PINK, name: s.childName, photo: photos.child,
      rows: [
        ['Adm. No', s.admissionCode],
        ['Class', s.className],
        ['Date of birth', dob],
        ['Blood group', s.bloodGroup || '—'],
        ['Guardian', `${s.parentName}${s.guardianRelation ? ` (${s.guardianRelation})` : ''}`],
        ['Phone', s.phone]
      ],
      note: 'If found, please call the school or the guardian.'
    },
    {
      kind: 'GUARDIAN 1', colour: VIOLET, name: s.parentName, photo: photos.guardian1,
      rows: [
        ['Relation', s.guardianRelation || ''],
        ['Phone', s.phone],
        ['Child', childLine],
        ['Adm. No', s.admissionCode]
      ],
      note: 'Authorised to collect the child. Show this card at the gate.'
    },
    {
      kind: 'GUARDIAN 2', colour: TEAL, name: s.guardian2Name || '', photo: photos.guardian2,
      rows: [
        ['Relation', s.guardian2Relation || ''],
        ['Phone', s.guardian2Phone || ''],
        ['Child', childLine],
        ['Adm. No', s.admissionCode]
      ],
      note: 'Authorised to collect the child. Show this card at the gate.'
    }
  ];

  for (let i = 0; i < cards.length; i++) {
    if (i > 0) doc.addPage([CARD_H, CARD_W], 'landscape');
    const qr = await toDataURL(`${s.admissionCode}|${cards[i].kind}|${s.childName}`, { margin: 0, width: 240, errorCorrectionLevel: 'M' });
    drawCard(doc, cards[i], school, qr);
  }

  doc.setProperties({ title: `${s.admissionCode} ID cards — ${s.childName}`, author: school.name });
  doc.save(`${s.admissionCode}-${safeFileName(s.childName)}-ID-cards.pdf`);
}

function drawCard(doc: JsPdf, c: CardPerson, school: PreSchoolIdCardSchool, qr: string): void {
  // Header band.
  doc.setFillColor(...c.colour);
  doc.rect(0, 0, CARD_W, 11.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.text(school.name, 4, 5.6);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5.4);
  doc.text('Play Group · Nursery · LKG · UKG', 4, 9.2);

  // Card type, in a white pill on the right of the band.
  doc.setFontSize(6);
  doc.setFont('helvetica', 'bold');
  const tag = c.kind;
  const tagW = doc.getTextWidth(tag) + 4;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(CARD_W - 4 - tagW, 3.4, tagW, 4.6, 2.3, 2.3, 'F');
  doc.setTextColor(...c.colour);
  doc.text(tag, CARD_W - 4 - tagW / 2, 6.6, { align: 'center' });

  // Photo.
  const px = 4, py = 14.5, pw = 19, ph = 23.75;
  doc.setDrawColor(...c.colour);
  doc.setLineWidth(0.5);
  if (c.photo) {
    doc.addImage(c.photo, imageFormat(c.photo), px, py, pw, ph, undefined, 'FAST');
  } else {
    doc.setFillColor(245, 243, 255);
    doc.rect(px, py, pw, ph, 'F');
    doc.setTextColor(...MUTED);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.5);
    doc.text('Paste photo', px + pw / 2, py + ph / 2 + 1, { align: 'center' });
  }
  doc.rect(px, py, pw, ph, 'S');

  // Name and details.
  const tx = 26, maxW = 38;
  doc.setTextColor(...INK);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.6);
  let y = 17.2;
  if (c.name) {
    const nameLines = (doc.splitTextToSize(c.name, maxW) as string[]).slice(0, 2);
    doc.text(nameLines, tx, y);
    y += nameLines.length * 3.6 + 0.6;
  } else {
    blank(doc, tx, y, maxW);
    y += 4.2;
  }

  doc.setFontSize(5.6);
  for (const [label, value] of c.rows) {
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...MUTED);
    doc.text(label, tx, y);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...INK);
    if (value) {
      const line = (doc.splitTextToSize(value, maxW - 14) as string[])[0];
      doc.text(line, tx + 14, y);
    } else {
      blank(doc, tx + 14, y, maxW - 14);
    }
    y += 3.25;
    if (y > 40.5) break;
  }

  // QR code: the admission number and which card this is, for a quick check at the gate.
  doc.addImage(qr, 'PNG', CARD_W - 4 - 15, 15, 15, 15, undefined, 'FAST');
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.4);
  doc.setTextColor(...MUTED);
  doc.text('Scan to verify', CARD_W - 4 - 7.5, 32.4, { align: 'center' });

  // Note and footer.
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(5);
  doc.setTextColor(...c.colour);
  doc.text(c.note, 4, 43.2);

  doc.setFillColor(...c.colour);
  doc.rect(0, 45.5, CARD_W, CARD_H - 45.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.6);
  const footer = [school.address, school.phone ? `Phone ${school.phone}` : null].filter(Boolean).join('  ·  ');
  const footerLines = (doc.splitTextToSize(footer, CARD_W - 8) as string[]).slice(0, 2);
  doc.text(footerLines, CARD_W / 2, footerLines.length > 1 ? 48.6 : 50.4, { align: 'center' });
}

/** A line to write on, where the form left a field empty. */
function blank(doc: JsPdf, x: number, y: number, w: number): void {
  doc.setDrawColor(190, 190, 200);
  doc.setLineWidth(0.2);
  doc.line(x, y + 0.6, x + w, y + 0.6);
}

function imageFormat(dataUrl: string): string {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/webp')) return 'WEBP';
  return 'JPEG';
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return `${`${d}`.padStart(2, '0')} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1]} ${y}`;
}

function safeFileName(name: string): string {
  return name.trim().replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'child';
}
