import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';

import { formatMoney } from '../../../core/format/money';
import { PreSchoolSalaryPayment } from '../../../core/models/preschool-finance.model';
import { monthLabel } from '../../../core/models/preschool-student.model';
import { openPendingDocumentWindow, writeDocumentWindow } from '../../../core/printing/legacy-documents';
import { preSchoolPayslipHtml } from '../../../core/printing/preschool-payslip';
import { PreSchoolFinanceService } from '../../../core/services/preschool-finance.service';

/**
 * A PreSchool receptionist's or teacher's own salary slips, month by month,
 * to view and print. Only their own: the server matches the email on their
 * staff record to their sign-in.
 */
@Component({
  selector: 'app-preschool-my-payslips',
  standalone: true,
  imports: [DatePipe, ButtonModule],
  template: `
    <div class="app-page-head">
      <span class="app-eyebrow">Avijan PreSchool</span>
      <h1>My payslips</h1>
      <p class="app-muted">Your salary for each month, as the PreSchool paid it. Open one to print or save it as PDF.</p>
    </div>

    <div class="pmp">
      @for (p of list(); track p.id) {
        <article class="app-card pmp__item">
          <div class="pmp__month"><strong>{{ label(p.forMonth) }}</strong><small>paid {{ p.paidOn | date: 'd MMM y' }} · {{ p.mode }}</small></div>
          <div class="pmp__nums">
            <span>Salary {{ money(p.salary) }}</span>
            @if (p.deduction) { <span class="pmp__cut">− {{ money(p.deduction) }} ({{ p.daysAbsent }} days absent)</span> }
          </div>
          <strong class="pmp__net">{{ money(p.netPaid) }}</strong>
          <p-button label="Payslip" icon="pi pi-print" size="small" [outlined]="true" (onClick)="open(p)" />
        </article>
      } @empty {
        @if (loaded()) {
          <p class="app-muted pmp__none">No payslips yet. They appear here once the PreSchool pays your salary.
            If you have been paid and see nothing, ask the PreSchool admin to put your sign-in email on your staff record.</p>
        }
      }
    </div>
  `,
  styles: [`
    .pmp { display: flex; flex-direction: column; gap: 0.7rem; max-width: 46rem; }
    .pmp__item { display: grid; grid-template-columns: 1fr 1.3fr auto auto; gap: 1rem; align-items: center; padding: 0.85rem 1.1rem; }
    .pmp__month strong { display: block; font-size: 1.05rem; }
    .pmp__month small, .pmp__nums span { display: block; color: var(--app-text-muted); font-size: 0.82rem; }
    .pmp__cut { color: #b42318 !important; }
    .pmp__net { font-size: 1.15rem; }
    .pmp__none { max-width: 40rem; }
    @media (max-width: 640px) { .pmp__item { grid-template-columns: 1fr auto; } .pmp__nums { display: none; } }
  `]
})
export class PreSchoolMyPayslipsComponent implements OnInit {
  private readonly finance = inject(PreSchoolFinanceService);
  private readonly messages = inject(MessageService);

  readonly list = signal<PreSchoolSalaryPayment[]>([]);
  readonly loaded = signal(false);
  readonly money = formatMoney;
  readonly label = monthLabel;

  ngOnInit(): void {
    this.finance.myPayslips().subscribe(l => { this.list.set(l); this.loaded.set(true); });
  }

  open(p: PreSchoolSalaryPayment): void {
    const win = openPendingDocumentWindow(760, 900);
    if (!writeDocumentWindow(win, preSchoolPayslipHtml(p))) {
      this.messages.add({ severity: 'warn', summary: 'Pop-up blocked', detail: 'Allow pop-ups for this site to open the payslip.', life: 4500 });
    }
  }
}
