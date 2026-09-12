import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import {
  AttendanceGrouping,
  AttendanceReport
} from '../../../core/models/attendance.model';
import { BranchListItem } from '../../../core/models/master.model';
import { AttendanceService } from '../../../core/services/attendance.service';
import { MasterService } from '../../../core/services/master.service';
import { downloadCsv, reportFileName, startOfMonth, toIsoDate } from '../report-utils';

/**
 * Staff attendance and hours, by day, month or year.
 *
 * <p>Absence is the absence of a scan: every day in the range is a working day, so
 * a day nobody scanned is leave. A day where somebody scanned in and never scanned
 * out is leave too, once their deadline has passed — reported separately, because
 * unlike a real absence it is a habit that can be corrected.</p>
 */
@Component({
  selector: 'app-attendance-report',
  imports: [
    CommonModule, FormsModule, ButtonModule, DatePickerModule,
    SelectModule, TableModule, TagModule
  ],
  templateUrl: './attendance-report.component.html',
  styleUrl: './attendance-report.component.scss'
})
export class AttendanceReportComponent {
  private readonly attendance = inject(AttendanceService);
  private readonly masters = inject(MasterService);

  readonly report = signal<AttendanceReport | null>(null);
  readonly loading = signal(false);

  /** Days somebody was present for but lost by never scanning out. */
  readonly daysLostToNoScanOut = computed(() =>
    this.report()?.days.filter(d => d.countedAsLeave).length ?? 0);

  readonly from = signal<Date>(startOfMonth());
  readonly to = signal<Date>(new Date());
  readonly groupBy = signal<AttendanceGrouping>('Day');
  readonly staffType = signal<string | null>(null);

  /* Branch comes from the scan itself — whichever centre's fence the phone was
     inside — so filtering on it gives a true per-centre picture rather than one
     based on where somebody's record says they work. */
  readonly branch = signal<string | null>(null);
  readonly branches = signal<BranchListItem[]>([]);

  readonly groupings = [
    { label: 'Day', value: 'Day' },
    { label: 'Month', value: 'Month' },
    { label: 'Year', value: 'Year' }
  ];

  readonly staffTypes = [
    { label: 'Teachers', value: 'Teacher' },
    { label: 'Receptionists', value: 'Receptionist' }
  ];

  constructor() {
    this.masters.branches().subscribe(rows => this.branches.set(rows.filter(b => b.isActive)));

    this.run();
  }

  run(): void {
    const from = toIsoDate(this.from());
    const to = toIsoDate(this.to());

    if (!from || !to) return;

    this.loading.set(true);

    this.attendance.report(from, to, this.groupBy(), this.staffType(), this.branch()).subscribe({
      next: report => {
        this.report.set(report);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  exportCsv(): void {
    const report = this.report();
    if (!report) return;

    /* The day list, not the summary: a spreadsheet of totals cannot be checked,
       and the times are the whole point of keeping this record. */
    downloadCsv(
      reportFileName('attendance'),
      [
        'Date', 'Staff type', 'Name', 'Branch', 'First in', 'Last out',
        'Hours', 'Missing scan out', 'Counted as leave'
      ],
      report.days.map(d => [
        d.onDate,
        d.staffType,
        d.staffName ?? '',
        d.branch ?? '',
        d.firstIn ? new Date(d.firstIn).toLocaleTimeString() : '',
        d.lastOut ? new Date(d.lastOut).toLocaleTimeString() : '',
        d.hours ?? '',
        d.missingScanOut ? 'Yes' : 'No',
        d.countedAsLeave ? 'Yes' : 'No'
      ])
    );
  }
}
