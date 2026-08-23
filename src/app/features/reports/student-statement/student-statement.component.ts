import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, OnDestroy, inject, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { ApiResponse } from '../../../core/models/api-response.model';
import { FeeReceipt } from '../../../core/models/fee.model';
import { StatementPayment, StudentCertificate, StudentStatement } from '../../../core/models/report.model';
import { ReportService } from '../../../core/services/report.service';
import { StudentService } from '../../../core/services/student.service';
import { downloadCsv, reportFileName } from '../report-utils';

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
    TagModule
  ],
  templateUrl: './student-statement.component.html',
  styleUrl: './student-statement.component.scss'
})
export class StudentStatementComponent implements OnDestroy {
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
    this.reports.myReceipt(payment.feeId).subscribe({
      next: receipt => this.openPrintWindow(
        `Money receipt ${receipt.billNo ?? ''}`, this.receiptBody(receipt)),
      error: (error: unknown) => this.showError(error)
    });
  }

  /** The Download Certificate button at the foot of the legacy page. */
  downloadCertificate(): void {
    this.certificateLoading.set(true);

    this.reports.myCertificate().subscribe({
      next: certificate => {
        this.certificateLoading.set(false);

        if (!certificate.isComplete) {
          this.messages.add({
            severity: 'warn',
            summary: 'Course not marked complete',
            detail: 'Your record is still active, so this certificate is provisional.',
            life: 7000
          });
        }

        this.openPrintWindow('Certificate', this.certificateBody(certificate));
      },
      error: (error: unknown) => {
        this.certificateLoading.set(false);
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

  /**
   * Opens a print window. The legacy certificate pulled html2pdf from a CDN and
   * rasterised the page at scale 3, giving a large blurry bitmap; the browser's own
   * print-to-PDF keeps the text selectable and needs no dependency.
   */
  private openPrintWindow(title: string, body: string): void {
    const win = window.open('', '_blank', 'width=900,height=1000');

    if (!win) {
      this.messages.add({
        severity: 'warn',
        summary: 'Popup blocked',
        detail: 'Allow popups for this site to download.',
        life: 6000
      });
      return;
    }

    win.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>${this.esc(title)}</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #1f2430; margin: 32px; }
  h1 { font-size: 20px; margin: 0; letter-spacing: -0.01em; }
  .sub { color: #6b7280; font-size: 13px; margin-top: 4px; }
  .head { border-bottom: 2px solid #6d28d9; padding-bottom: 12px; margin-bottom: 24px; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 9px 4px; border-bottom: 1px solid #e4e6ef; }
  th { width: 40%; color: #6b7280; font-weight: 600; }
  .words { margin-top: 20px; font-size: 13px; font-style: italic; color: #384152; }
  .due { color: #dc2626; font-weight: 600; }
  .sign { margin-top: 64px; display: flex; justify-content: space-between; font-size: 13px; color: #6b7280; }
  .cert { border: 6px double #6d28d9; padding: 44px 52px; text-align: center; }
  .cert h2 { font-size: 30px; margin: 0 0 6px; letter-spacing: 0.08em; text-transform: uppercase; }
  .cert .issuer { font-size: 14px; color: #6b7280; margin-bottom: 32px; }
  .cert p { font-size: 15px; line-height: 2.1; margin: 0; }
  .cert .field { font-weight: 700; border-bottom: 1px solid #9aa1b1; padding: 0 10px; }
  .cert .grade { margin-top: 28px; font-size: 18px; font-weight: 700; }
  .cert .provisional { margin-top: 18px; color: #b45309; font-size: 12px; }
  @media print { body { margin: 12mm; } }
</style></head><body>${body}
<script>window.onload = function () { window.print(); };<\/script>
</body></html>`);

    win.document.close();
  }

  private receiptBody(r: FeeReceipt): string {
    return `
  <div class="head">
    <h1>Avijan &mdash; Money Receipt</h1>
    <div class="sub">Bill No. ${this.esc(r.billNo)}</div>
  </div>
  <table>
    <tr><th>Student name</th><td>${this.esc(r.studentName)}</td></tr>
    <tr><th>Registration id</th><td>${this.esc(r.registrationId)}</td></tr>
    <tr><th>Course</th><td>${this.esc(r.courseName)}</td></tr>
    <tr><th>Fee month</th><td>${this.longDate(r.feeDate)}</td></tr>
    <tr><th>Amount received</th><td>${this.money(r.amountPaid)}</td></tr>
    <tr><th>Previous due</th><td>${this.money(r.oldDue)}</td></tr>
    <tr><th>Balance due</th><td class="due">${this.money(r.newDue)}</td></tr>
    <tr><th>Next payment due</th><td>${this.longDate(r.nextDueDate)}</td></tr>
  </table>
  <p class="words">Rupees ${this.esc(r.amountPaidInWords)} only.</p>
  <div class="sign"><span>Student / Guardian signature</span><span>For Avijan</span></div>`;
  }

  private certificateBody(c: StudentCertificate): string {
    const months = c.courseDuration ? `${c.courseDuration} months` : '';

    return `
  <div class="cert">
    <h2>Certificate of Completion</h2>
    <div class="issuer">Avijan Computer Education</div>
    <p>
      This is to certify that <span class="field">${this.esc(c.studentName)}</span>,
      son / daughter / wife of <span class="field">${this.esc(c.guardianName)}</span>,
      bearing registration number <span class="field">${this.esc(c.registrationId)}</span>,
      has successfully completed the course
      <span class="field">${this.esc(c.courseName)}</span>
      ${months ? `of <span class="field">${months}</span>` : ''}
      from <span class="field">${this.longDate(c.dateOfJoining)}</span>
      to <span class="field">${this.longDate(c.examDate)}</span>.
    </p>
    <div class="grade">
      Grade obtained: ${this.esc(c.grade)}
      &nbsp;&middot;&nbsp; ${c.totalObtainedMarks} / ${c.totalFullMarks} (${c.percentScored}%)
    </div>
    ${c.isComplete ? '' : '<div class="provisional">Provisional &mdash; the course is not yet marked complete.</div>'}
    <div class="sign"><span>Date: ${this.longDate(c.generatedOn)}</span><span>For Avijan</span></div>
  </div>`;
  }

  private esc(value?: string): string {
    return (value ?? '').replace(/[&<>"']/g, ch =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch] ?? ch);
  }

  private longDate(value?: string | null): string {
    return value
      ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })
      : '—';
  }

  private money(value?: number | null): string {
    return (value ?? 0).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
  }

  gradeSeverity(grade: string): 'success' | 'info' | 'warn' | 'danger' {
    if (grade === 'AA' || grade === 'A+') return 'success';
    if (grade === 'A' || grade === 'B+') return 'info';
    if (grade === 'B' || grade === 'C') return 'warn';
    return 'danger';
  }
}
