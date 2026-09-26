import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, inject, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { ApiResponse } from '../../../core/models/api-response.model';
import { StatementPayment, StudentCertificate, StudentStatement } from '../../../core/models/report.model';
import {
  certificateHtml,
  moneyReceiptHtml,
  openPendingDocumentWindow,
  writeDocumentWindow
} from '../../../core/printing/legacy-documents';
import { saveCertificatePdf } from '../../../core/printing/pdf-download';
import { ReportService } from '../../../core/services/report.service';
import { StudentService } from '../../../core/services/student.service';
import { downloadCsv, reportFileName } from '../report-utils';
import { FeaturesService } from '../../../core/services/features.service';
import { OrgChartComponent } from '../../org/org-chart.component';

/**
 * A student's own statement: profile, fee ledger and marks.
 * Replaces `Views/StudentReport/Index.cshtml` + `Scripts/StudentReport.js`.
 *
 * **Student role only**, as the legacy `StudentReport/Index` was
 * (`[Authorize(Roles = "Student")]`). There is nothing to search for and no
 * registration id to enter: the student is resolved from their sign-in, so this
 * screen can only ever show the person looking at it.
 *
 * The legacy page made four chained round trips — resolve the id from the session,
 * then the profile, then the ledger, then the marks — each firing from the previous
 * callback. It is one request now.
 */
@Component({
  selector: 'app-student-statement',
  imports: [
    CommonModule,
    ButtonModule,
    TableModule,
    TagModule,
    OrgChartComponent
  ],
  templateUrl: './student-statement.component.html',
  styleUrl: './student-statement.component.scss'
})
export class StudentStatementComponent implements OnDestroy {
  /** The hierarchy is only shown once it has been switched on server-side. */
  protected readonly features = inject(FeaturesService);

  private readonly reports = inject(ReportService);
  private readonly students = inject(StudentService);
  private readonly messages = inject(MessageService);

  readonly statement = signal<StudentStatement | null>(null);
  readonly loading = signal(false);
  readonly photoUrl = signal<string | null>(null);
  readonly certificateLoading = signal(false);

  constructor() {
    this.load();
  }

  ngOnDestroy(): void {
    this.revokePhoto();
  }

  private load(): void {
    this.loading.set(true);
    this.revokePhoto();

    this.reports.studentStatement().subscribe({
      next: statement => {
        this.statement.set(statement);
        this.loading.set(false);

        if (statement.hasPhoto && statement.registrationId) {
          this.loadPhoto(statement.registrationId);
        }
      },
      error: (error: unknown) => {
        this.loading.set(false);
        this.statement.set(null);

        if (error instanceof HttpErrorResponse) {
          const body = error.error as ApiResponse<unknown> | null;
          if (body?.message) {
            this.messages.add({
              severity: 'error',
              summary: 'No statement',
              detail: body.message,
              life: 8000
            });
          }
        }
      }
    });
  }

  /** An `<img src>` cannot carry the bearer token, so the photo comes as a blob. */
  private loadPhoto(registrationId: string): void {
    this.students.photoBlob(registrationId).subscribe({
      next: blob => this.photoUrl.set(URL.createObjectURL(blob)),
      error: () => this.photoUrl.set(null)
    });
  }

  private revokePhoto(): void {
    const url = this.photoUrl();

    if (url) {
      URL.revokeObjectURL(url);
      this.photoUrl.set(null);
    }
  }

  exportCsv(): void {
    const s = this.statement();
    if (!s) return;

    downloadCsv(
      reportFileName(`statement-${(s.registrationId ?? '').replace(/\//g, '-')}`),
      ['Bill no', 'Payment date', 'Amount paid', 'Instalment', 'Fine', 'Due after'],
      s.payments.map(p => [
        p.billNo, p.paymentDate, p.amountPaid, p.instalmentOnly, p.fine, p.dueAfter
      ])
    );
  }

  /** Print the statement through the browser, which gives real selectable text. */
  print(): void {
    window.print();
  }

  /* --------------------------------------------------------- downloads */

  /** Per-row Download on the legacy page: the money receipt for one payment. */
  downloadReceipt(payment: StatementPayment): void {
    const win = openPendingDocumentWindow(760);

    this.reports.myReceipt(payment.feeId).subscribe({
      next: receipt => {
        if (!writeDocumentWindow(win, moneyReceiptHtml(receipt))) this.popupBlocked('receipt');
      },
      error: (error: unknown) => {
        win?.close();
        this.showError(error);
      }
    });
  }

  /** The Download Certificate button at the foot of the legacy page. */
  downloadCertificate(): void {
    this.certificateLoading.set(true);

    const win = openPendingDocumentWindow(1180);

    this.reports.issueMyCertificate().subscribe({
      next: certificate => {
        this.certificateLoading.set(false);

        // Say plainly what has just been issued. A student who has taken a copy
        // before should not discover the DUPLICATE marking only after printing.
        if (certificate.isDuplicate) {
          this.messages.add({
            severity: 'info',
            summary: `Duplicate copy — no. ${certificate.issueNo}`,
            detail:
              `You have now taken ${certificate.issueNo} copies of this certificate. ` +
              'This one is marked DUPLICATE COPY; only the first is the original.',
            life: 9000
          });
        }

        this.openCertificateWindow(certificate, win);
      },
      error: (error: unknown) => {
        this.certificateLoading.set(false);
        win?.close();
        this.showError(error);
      }
    });
  }

  private showError(error: unknown): void {
    if (error instanceof HttpErrorResponse) {
      const body = error.error as ApiResponse<unknown> | null;
      if (body?.message) {
        this.messages.add({
          severity: 'error',
          summary: 'Not available',
          detail: body.message,
          life: 8000
        });
      }
    }
  }

  /** The certificate, in the legacy layout. */
  private openCertificateWindow(c: StudentCertificate, win: Window | null): void {
    saveCertificatePdf(c).catch(() =>
      this.messages.add({
        severity: 'warn',
        summary: 'PDF not saved',
        detail: 'Could not save your certificate as a PDF. Try again.',
        life: 6000
      }));

    if (!writeDocumentWindow(win, certificateHtml(c))) this.popupBlocked('certificate');
  }

  private popupBlocked(what: string): void {
    this.messages.add({
      severity: 'warn',
      summary: 'Popup blocked',
      detail: `Allow popups for this site to download your ${what}.`,
      life: 6000
    });
  }

  gradeSeverity(grade: string): 'success' | 'info' | 'warn' | 'danger' {
    if (grade === 'AA' || grade === 'A+') return 'success';
    if (grade === 'A' || grade === 'B+') return 'info';
    if (grade === 'B' || grade === 'C') return 'warn';
    return 'danger';
  }
}
