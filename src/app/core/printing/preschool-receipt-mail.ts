import { firstValueFrom } from 'rxjs';

import { PreSchoolReceipt, PreSchoolReceiptMailResult } from '../models/preschool-student.model';
import { PreSchoolStudentService } from '../services/preschool-student.service';
import { sizedPdfBase64 } from './pdf-download';
import { feeReceiptHtml } from './preschool-forms';

/**
 * Emails a PreSchool receipt to the child's guardian (the email on the child's
 * record), from the PreSchool's mailbox, with the parent copy attached as a
 * half-A4 PDF. Never throws: if the PDF cannot be made the mail goes without
 * it, and a failure comes back as a message to show.
 */
export async function emailReceiptToGuardian(api: PreSchoolStudentService, r: PreSchoolReceipt): Promise<PreSchoolReceiptMailResult> {
  let pdf: string | null = null;
  try {
    pdf = await sizedPdfBase64(feeReceiptHtml(r, 'parent'), { width: 559, format: 'a5' });
  } catch { /* sent without the attachment */ }
  try {
    return await firstValueFrom(api.emailReceipt(r.id, pdf));
  } catch {
    return { sent: false, message: 'The receipt could not be emailed just now.' };
  }
}
