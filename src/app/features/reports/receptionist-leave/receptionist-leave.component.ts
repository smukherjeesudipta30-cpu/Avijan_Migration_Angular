import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';

import { AuthService } from '../../../core/services/auth.service';
import {
  LeavePeriodType,
  ReceptionistLeaveReport,
  ReceptionistLeaveReportLine
} from '../../../core/models/receptionist.model';
import { ReceptionistService } from '../../../core/services/receptionist.service';
import { downloadCsv, reportFileName } from '../report-utils';

const PERIOD_OPTIONS: { label: string; value: LeavePeriodType }[] = [
  { label: 'Weekly', value: 'Weekly' },
  { label: 'Monthly', value: 'Monthly' },
  { label: 'Yearly', value: 'Yearly' }
];

/**
 * Leave taken against entitlement for every rostered receptionist, and the
 * salary deduction an Admin may choose to apply once leave exceeds it.
 *
 * Entitlement follows the shift pattern each receptionist is rostered for
 * (Staff Rota): 6 shifts/week -> 1.5 days/month, 4 -> 1 day, 3 -> 0.8 day,
 * 2 -> 0.5 day, scaled the same way for a weekly or yearly view. Leave taken
 * is never stored — it is rostered days minus days actually scanned in,
 * computed fresh every time the report runs, the same way attendance itself
 * is never stored as an "absent" row.
 *
 * Editor sees every column but the deduction controls are disabled for them —
 * deciding whether pay is actually docked, and by how much, stays with Admin.
 */
@Component({
  selector: 'app-receptionist-leave',
  imports: [
    CommonModule,
    FormsModule,
    ButtonModule,
    CheckboxModule,
    DatePickerModule,
    InputNumberModule,
    SelectModule,
    TableModule
  ],
  templateUrl: './receptionist-leave.component.html',
  styleUrl: './receptionist-leave.component.scss'
})
export class ReceptionistLeaveComponent {
  private readonly service = inject(ReceptionistService);
  private readonly auth = inject(AuthService);

  readonly periodOptions = PERIOD_OPTIONS;

  readonly data = signal<ReceptionistLeaveReport | null>(null);
  readonly loading = signal(false);
  readonly saving = signal<number | null>(null);

  readonly branch = signal<string | null>(null);
  readonly periodType = signal<LeavePeriodType>('Monthly');
  readonly date = signal<Date>(new Date());

  /** Only an Admin decides whether pay is actually docked; SuperAdmin passes every role check. */
  readonly canEdit = computed(() => this.auth.hasAnyRole(['Admin']));

  readonly branchOptions = computed(() =>
    Array.from(new Set((this.data()?.rows ?? []).map(r => r.branch).filter((b): b is string => !!b)))
      .sort()
      .map(b => ({ label: b, value: b })));

  /** Local edit buffer so a half-typed percentage isn't pushed to the server on every keystroke. */
  readonly drafts = signal<Record<number, { percent: number; applied: boolean; notes: string }>>({});

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);

    this.service
      .leaveReport(this.periodType(), this.toIsoDate(this.date()), this.branch())
      .subscribe({
        next: report => {
          this.data.set(report);
          const drafts: Record<number, { percent: number; applied: boolean; notes: string }> = {};
          for (const row of report.rows) {
            drafts[row.receptionistId] = {
              percent: row.deductionPercent,
              applied: row.applied,
              notes: row.notes ?? ''
            };
          }
          this.drafts.set(drafts);
          this.loading.set(false);
        },
        error: () => this.loading.set(false)
      });
  }

  draftPercent(row: ReceptionistLeaveReportLine): number {
    return this.drafts()[row.receptionistId]?.percent ?? row.deductionPercent;
  }

  draftApplied(row: ReceptionistLeaveReportLine): boolean {
    return this.drafts()[row.receptionistId]?.applied ?? row.applied;
  }

  setDraftPercent(row: ReceptionistLeaveReportLine, value: number): void {
    this.drafts.update(d => ({
      ...d,
      [row.receptionistId]: { ...d[row.receptionistId], percent: value ?? 0, applied: d[row.receptionistId]?.applied ?? row.applied, notes: d[row.receptionistId]?.notes ?? row.notes ?? '' }
    }));
  }

  setDraftApplied(row: ReceptionistLeaveReportLine, value: boolean): void {
    this.drafts.update(d => ({
      ...d,
      [row.receptionistId]: { ...d[row.receptionistId], applied: value, percent: d[row.receptionistId]?.percent ?? row.deductionPercent, notes: d[row.receptionistId]?.notes ?? row.notes ?? '' }
    }));
  }

  save(row: ReceptionistLeaveReportLine): void {
    const report = this.data();
    const draft = this.drafts()[row.receptionistId];
    if (!report || !draft) return;

    this.saving.set(row.receptionistId);

    this.service
      .setLeaveDeduction({
        receptionistId: row.receptionistId,
        periodType: report.periodType,
        periodStart: report.periodStart,
        deductionPercent: draft.percent,
        applied: draft.applied,
        notes: draft.notes || null
      })
      .subscribe({
        next: () => {
          this.saving.set(null);
          this.load();
        },
        error: () => this.saving.set(null)
      });
  }

  exportCsv(): void {
    const report = this.data();
    if (!report) return;

    downloadCsv(
      reportFileName('receptionist-leave'),
      ['Branch', 'Receptionist', 'Shifts/week', 'Entitlement (days)', 'Leave taken (days)', 'Exceeds?', 'Deduction %', 'Applied'],
      report.rows.map(r => [
        r.branch ?? '',
        r.receptionistName,
        r.shiftsPerWeek,
        r.entitlementDays,
        r.takenDays,
        r.exceedsEntitlement ? 'Yes' : 'No',
        r.deductionPercent,
        r.applied ? 'Yes' : 'No'
      ])
    );
  }

  private toIsoDate(date: Date): string {
    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${date.getFullYear()}-${month}-${day}`;
  }
}
