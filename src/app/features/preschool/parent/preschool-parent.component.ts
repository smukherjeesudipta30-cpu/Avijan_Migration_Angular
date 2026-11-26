import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';

import { formatMoney } from '../../../core/format/money';
import { PreSchoolPublic } from '../../../core/models/preschool.model';
import { PreSchoolParentChild, monthLabel } from '../../../core/models/preschool-student.model';
import { downloadSizedPdf, pdfFileName } from '../../../core/printing/pdf-download';
import { feeReceiptHtml } from '../../../core/printing/preschool-forms';
import { AuthService } from '../../../core/services/auth.service';
import { PreSchoolService } from '../../../core/services/preschool.service';
import { PreSchoolStudentService } from '../../../core/services/preschool-student.service';
import { PreSchoolClosuresComponent } from '../../../shared/preschool-closures/preschool-closures.component';

/**
 * Where a parent lands after signing in: each of their children (matched by
 * the guardian email or phone on the child's record) with the admission
 * details, every month paid or due, the receipts to save as PDF, and the
 * results of every exam held — plus the school's holidays and how to reach it.
 */
@Component({
  selector: 'app-preschool-parent',
  standalone: true,
  imports: [DatePipe, RouterLink, ButtonModule, PreSchoolClosuresComponent],
  template: `
    @if (!isParent()) {
      <p class="pp__preview"><i class="pi pi-eye" aria-hidden="true"></i> Preview: this is the page a parent sees after signing in (their own children only).</p>
    }

    <div class="pp">
      <header class="pp__hero">
        <div>
          <span class="pp__pill">Avijan PreSchool · My child</span>
          <h1>Welcome{{ isParent() && name() ? ', ' + name() : '' }} <span aria-hidden="true">🧸</span></h1>
          <p>Your child's admission details, fees, receipts and exam results, all in one place.</p>
        </div>
      </header>

      @if (!loaded()) {
        <p class="pp__muted"><i class="pi pi-spin pi-spinner"></i> Loading…</p>
      } @else if (!children().length) {
        <section class="pp__card pp__empty">
          <span aria-hidden="true">🌱</span>
          <p><strong>We could not find your child yet.</strong></p>
          <p class="pp__muted">Your sign-in is matched to the email or phone number given at admission. If they differ,
            please ask the PreSchool office to update your child's record.</p>
        </section>
      } @else {
        @if (children().length > 1) {
          <div class="pp__tabs" role="tablist">
            @for (k of children(); track k.child.id; let i = $index) {
              <button type="button" role="tab" [class.on]="pick() === i" (click)="pick.set(i)">{{ k.child.childName }}</button>
            }
          </div>
        }

        @if (current(); as k) {
          <div class="pp__grid">
            <section class="pp__card pp__adm">
              <h2>👶 {{ k.child.childName }}</h2>
              <dl>
                <div><dt>Admission No.</dt><dd>{{ k.child.admissionCode }}</dd></div>
                <div><dt>Class</dt><dd>{{ k.child.className }}@if (k.child.section) { · {{ k.child.section }} }</dd></div>
                <div><dt>Joined</dt><dd>{{ k.child.joinedOn | date: 'd MMM y' }}</dd></div>
                <div><dt>Date of birth</dt><dd>{{ k.child.dateOfBirth | date: 'd MMM y' }}</dd></div>
                <div><dt>Status</dt><dd>{{ k.child.status === 'Active' ? 'Studying' : k.child.status }}</dd></div>
                <div><dt>Monthly fee</dt><dd>{{ money(k.child.monthlyFee) }}</dd></div>
                <div><dt>Parent</dt><dd>{{ k.child.parentName }}</dd></div>
                <div><dt>Phone</dt><dd>{{ k.child.phone }}</dd></div>
              </dl>
            </section>

            <section class="pp__card pp__due" [class.pp__due--ok]="!k.amountDue">
              @if (k.amountDue > 0) {
                <span>Fees due now</span>
                <strong>{{ money(k.amountDue) }}</strong>
                <small>{{ dueMonths(k).length }} month{{ dueMonths(k).length === 1 ? '' : 's' }}
                  @if (k.instalmentDue) { · instalment {{ money(k.instalmentDue) }} }
                  — please pay at the school office.</small>
              } @else {
                <span>Fees</span>
                <strong>All paid 🎉</strong>
                <small>Thank you!</small>
              }
            </section>
          </div>

          <section class="pp__card">
            <h2>📅 Monthly fees</h2>
            <div class="pp__months">
              @for (m of k.child.months; track m.month) {
                <span class="pp__month" [class.paid]="m.isPaid">{{ label(m.month) }}
                  <small>{{ m.isPaid ? 'Paid · ' + (m.receiptCode ?? '') : 'Due · ' + money(m.amount) }}</small></span>
              } @empty { <p class="pp__muted">No months billed yet.</p> }
            </div>
          </section>

          <section class="pp__card">
            <h2>🧾 Receipts</h2>
            @for (r of k.child.receipts; track r.id) {
              <div class="pp__receipt" [class.void]="r.isCancelled">
                <span><strong>{{ r.receiptCode }}</strong> · {{ r.receivedOn | date: 'd MMM y' }}@if (r.isCancelled) { · Cancelled }
                  <small>{{ r.summary }}</small>
                  @if ((r.balance ?? 0) > 0) { <small class="pp__bal">Paid {{ money(r.paid ?? 0) }} · balance {{ money(r.balance ?? 0) }}</small> }</span>
                <strong>{{ money(r.total) }}</strong>
                @if (!r.isCancelled) {
                  <p-button icon="pi pi-file-pdf" label="PDF" size="small" [outlined]="true" [loading]="saving() === r.id" (onClick)="pdf(r.id)" />
                }
              </div>
            } @empty { <p class="pp__muted">No receipts yet.</p> }
          </section>

          <section class="pp__card">
            <h2>⭐ Exam results</h2>
            @for (x of k.results; track x.examId) {
              <div class="pp__exam">
                <div class="pp__exam-head">
                  <span><strong>{{ x.examName }}</strong>@if (x.heldOn) { <small>{{ x.heldOn | date: 'd MMM y' }}</small> }</span>
                  <span class="pp__score">{{ x.total }} / {{ x.outOf }}@if (x.percent !== null && x.percent !== undefined) { · {{ x.percent }}% }
                    @if (x.grade) { <b class="pp__grade">{{ x.grade }}</b> }</span>
                </div>
                <div class="pp__subjects">
                  @for (s of x.subjects; track s.subject) {
                    <span><em>{{ s.subject }}</em>{{ s.isAbsent ? 'Absent' : (s.marks ?? '—') }}<small> / {{ s.maxMarks }}</small></span>
                  }
                </div>
              </div>
            } @empty { <p class="pp__muted">Results appear here after each exam.</p> }
          </section>
        }
      }

      @if (school(); as s) {
        <div class="pp__closures"><app-preschool-closures [holidays]="s.holidays" /></div>
        <section class="pp__card pp__contact">
          <h2>{{ s.schoolName }}</h2>
          @if (s.address) { <p><i class="pi pi-map-marker" aria-hidden="true"></i> {{ s.address }}</p> }
          @if (s.phone) { <p><i class="pi pi-phone" aria-hidden="true"></i> <a [href]="'tel:' + s.phone">School: {{ s.phone }}</a></p> }
          @if (s.officePhone) { <p><i class="pi pi-phone" aria-hidden="true"></i> <a [href]="'tel:' + s.officePhone">Champahati office: {{ s.officePhone }}</a></p> }
          @if (s.email) { <p><i class="pi pi-envelope" aria-hidden="true"></i> <a [href]="'mailto:' + s.email">{{ s.email }}</a></p> }
          @if (s.mapUrl) { <p><i class="pi pi-directions" aria-hidden="true"></i> <a [href]="s.mapUrl" target="_blank" rel="noopener">Get directions</a></p> }
          <p><a routerLink="/preschool">Visit the PreSchool website</a></p>
        </section>
      }
    </div>
  `,
  styles: [`
    .pp { max-width: 52rem; margin: 0 auto; font-family: 'Nunito', 'Segoe UI', system-ui, sans-serif; color: #2a2f45; }
    .pp__preview { max-width: 52rem; margin: 0 auto 0.75rem; padding: 0.5rem 0.8rem; border-radius: 8px;
      background: #fff1d6; color: #7a4a00; font-size: 0.85rem; display: flex; gap: 0.4rem; align-items: center; }
    .pp__hero { position: relative; padding: 1.4rem 1.5rem; border-radius: 26px; overflow: hidden;
      background: radial-gradient(circle at 85% 30%, #ffd6e7, #e3f2ff 55%, #fffaf3 85%); }
    .pp__hero::after { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 6px;
      background: linear-gradient(90deg, #ff6b8b, #ffb347 35%, #6cc56c 65%, #4aa3ff); }
    .pp__pill { display: inline-block; padding: 0.25rem 0.8rem; border-radius: 999px; background: #ffe3ec; color: #b3264f; font-weight: 800; font-size: 0.78rem; }
    .pp__hero h1 { margin: 0.6rem 0 0.25rem; font-size: clamp(1.5rem, 4vw, 2rem); }
    .pp__hero p { margin: 0; color: #4a5068; }
    .pp__muted { color: #6b7088; font-size: 0.88rem; }
    .pp__tabs { display: flex; gap: 0.4rem; flex-wrap: wrap; margin: 1rem 0 0; }
    .pp__tabs button { padding: 0.45rem 1rem; border-radius: 999px; border: 2px solid #ffd6e2; background: #fff; font: inherit; font-weight: 800; cursor: pointer; }
    .pp__tabs button.on { background: #ff6b8b; border-color: #ff6b8b; color: #fff; }
    .pp__grid { display: grid; grid-template-columns: 1.6fr 1fr; gap: 0.9rem; margin-top: 1rem; }
    .pp__card { padding: 1rem 1.15rem; border-radius: 22px; background: #fff; border: 2px solid #f6e7ec; margin-top: 0.9rem; }
    .pp__grid .pp__card { margin-top: 0; }
    .pp__card h2 { margin: 0 0 0.6rem; font-size: 1.1rem; }
    .pp__adm dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); gap: 0.5rem; margin: 0; }
    .pp__adm dl div { padding: 0.45rem 0.6rem; border-radius: 12px; background: #f3f9ff; }
    .pp__adm dl div:nth-child(4n+2) { background: #fff1d6; } .pp__adm dl div:nth-child(4n+3) { background: #e6f8e6; } .pp__adm dl div:nth-child(4n) { background: #ffe3ec; }
    .pp__adm dt { font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7088; }
    .pp__adm dd { margin: 0.1rem 0 0; font-weight: 800; font-size: 0.92rem; }
    .pp__due { display: flex; flex-direction: column; justify-content: center; text-align: center; background: #fff0f0; border-color: #ffd0d0; }
    .pp__due span { font-weight: 800; color: #6b7088; }
    .pp__due strong { font-size: 1.8rem; color: #b42318; margin: 0.2rem 0; }
    .pp__due small { color: #6b7088; }
    .pp__due--ok { background: #effaef; border-color: #cfeccf; }
    .pp__due--ok strong { color: #2b7a2b; }
    .pp__months { display: flex; flex-wrap: wrap; gap: 0.45rem; }
    .pp__month { display: inline-flex; flex-direction: column; align-items: center; min-width: 6rem; padding: 0.4rem 0.6rem; border-radius: 14px;
      background: #fff0f0; border: 2px solid #ffd0d0; font-weight: 800; font-size: 0.85rem; }
    .pp__month small { font-weight: 600; font-size: 0.7rem; color: #b42318; }
    .pp__month.paid { background: #effaef; border-color: #cfeccf; }
    .pp__month.paid small { color: #2b7a2b; }
    .pp__receipt { display: grid; grid-template-columns: 1fr auto auto; gap: 0.75rem; align-items: center; padding: 0.55rem 0; border-bottom: 1px dashed #f0e4ea; }
    .pp__receipt small { display: block; color: #6b7088; font-size: 0.78rem; }
    .pp__receipt.void { opacity: 0.55; }
    .pp__bal { color: #b45309 !important; font-weight: 700; }
    .pp__exam { padding: 0.7rem 0.8rem; border-radius: 16px; background: #fffaf3; border: 1px solid #ffe0a3; margin-bottom: 0.6rem; }
    .pp__exam-head { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem; flex-wrap: wrap; }
    .pp__exam-head small { margin-left: 0.4rem; color: #6b7088; }
    .pp__score { font-weight: 800; }
    .pp__grade { display: inline-block; margin-left: 0.35rem; padding: 0.05rem 0.55rem; border-radius: 999px; background: #ff6b8b; color: #fff; }
    .pp__subjects { display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.5rem; }
    .pp__subjects span { padding: 0.25rem 0.6rem; border-radius: 10px; background: #fff; border: 1px solid #f1e4ea; font-weight: 800; font-size: 0.85rem; }
    .pp__subjects em { font-style: normal; font-weight: 600; color: #6b7088; margin-right: 0.35rem; }
    .pp__subjects small { color: #8a8fa3; font-weight: 600; }
    .pp__empty { text-align: center; }
    .pp__empty span { font-size: 2.4rem; }
    .pp__closures { margin-top: 0.9rem; }
    .pp__contact p { margin: 0.3rem 0; display: flex; gap: 0.45rem; align-items: flex-start; }
    @media (max-width: 700px) { .pp__grid { grid-template-columns: 1fr; } .pp__receipt { grid-template-columns: 1fr auto; } }
  `]
})
export class PreSchoolParentComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly preschool = inject(PreSchoolService);
  private readonly students = inject(PreSchoolStudentService);
  private readonly messages = inject(MessageService);

  readonly school = signal<PreSchoolPublic | null>(null);
  readonly children = signal<PreSchoolParentChild[]>([]);
  readonly loaded = signal(false);
  readonly pick = signal(0);
  readonly saving = signal<number | null>(null);
  readonly money = formatMoney;
  readonly label = monthLabel;

  /** A SuperAdmin passes every role check, so ask about the role itself. */
  readonly isParent = computed(() => (this.auth.user()?.roles ?? []).includes('Parent'));
  readonly name = computed(() => this.auth.user()?.name?.split(' ')[0] ?? '');
  readonly current = computed(() => this.children()[this.pick()] ?? null);

  ngOnInit(): void {
    this.preschool.publicPage().subscribe({ next: s => this.school.set(s) });
    this.students.parentChildren().subscribe({
      next: c => { this.children.set(c); this.loaded.set(true); },
      error: () => this.loaded.set(true)
    });
  }

  dueMonths(k: PreSchoolParentChild) {
    return k.child.months.filter(m => !m.isPaid);
  }

  /** The parent copy of a receipt, half-A4, as a PDF. */
  pdf(receiptId: number): void {
    this.saving.set(receiptId);
    this.students.parentReceipt(receiptId).subscribe({
      next: r => downloadSizedPdf(feeReceiptHtml(r, 'parent'), pdfFileName('FeeReceipt', r.receiptCode, r.childName), { width: 559, format: 'a5' })
        .catch(() => this.messages.add({ severity: 'warn', summary: 'The PDF could not be made', detail: 'Please try again.', life: 4500 }))
        .finally(() => this.saving.set(null)),
      error: () => this.saving.set(null)
    });
  }
}
