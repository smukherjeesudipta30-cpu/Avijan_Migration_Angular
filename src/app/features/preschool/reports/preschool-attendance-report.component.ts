import { DatePipe, DecimalPipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { todayIso } from '../../../core/models/preschool.model';
import { openPendingDocumentWindow, writeDocumentWindow } from '../../../core/printing/legacy-documents';
import { PreSchoolAttendanceReport, PreSchoolAttendanceService } from '../../../core/services/preschool-attendance.service';

function monthStart(iso: string, offset = 0): string {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(y, m - 1 + offset, 1);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-01`;
}
function monthEnd(firstIso: string): string {
  const [y, m] = firstIso.split('-').map(Number);
  const d = new Date(y, m, 0);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`;
}
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const time = (iso?: string | null) => iso ? new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' }) : '—';

/**
 * The PreSchool receptionist's and teachers' attendance between two dates:
 * days present and absent (Sundays and PreSchool holidays are not absences),
 * hours, and each day's in and out times. The PreSchool admin only.
 */
@Component({
  selector: 'app-preschool-attendance-report',
  standalone: true,
  imports: [DatePipe, DecimalPipe, FormsModule, ButtonModule, InputTextModule],
  providers: [PreSchoolAttendanceService],
  template: `
    <div class="app-page-head">
      <span class="app-eyebrow">Avijan PreSchool</span>
      <h1>Staff attendance</h1>
      <p class="app-muted">Receptionist and teachers. Sundays and PreSchool holidays are not counted as absent.</p>
    </div>

    <section class="app-card psa-filter">
      <label>From <input pInputText type="date" [(ngModel)]="from" [max]="to" /></label>
      <label>To <input pInputText type="date" [(ngModel)]="to" [min]="from" /></label>
      <div class="psa-quick">
        <button type="button" (click)="month(0)">This month</button>
        <button type="button" (click)="month(-1)">Last month</button>
      </div>
      <p-button label="Show" icon="pi pi-search" [loading]="loading()" (onClick)="load()" />
      <p-button label="Print / PDF" icon="pi pi-print" severity="secondary" [outlined]="true" [disabled]="!report()" (onClick)="print()" />
    </section>

    @if (report(); as r) {
      <section class="app-card">
        <h2>Summary · {{ r.from | date: 'd MMM y' }} – {{ r.to | date: 'd MMM y' }}</h2>
        <div class="psa-table">
          <table>
            <thead><tr><th>Name</th><th>Role</th><th>Present</th><th>Absent</th><th>Hours</th><th>Not marked out</th></tr></thead>
            <tbody>
              @for (s of r.staff; track s.staffId) {
                <tr>
                  <td><strong>{{ s.staffName }}</strong></td><td>{{ s.role }}</td>
                  <td class="psa-ok">{{ s.daysPresent }}</td>
                  <td [class.psa-bad]="s.daysAbsent > 0">{{ s.daysAbsent }}</td>
                  <td>{{ s.totalHours | number: '1.0-2' }}</td>
                  <td [class.psa-warn]="s.daysMissingOut > 0">{{ s.daysMissingOut }}</td>
                </tr>
              } @empty {
                <tr><td colspan="6" class="app-muted">No receptionist or teacher on the staff list for these dates.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>

      <section class="app-card">
        <h2>Day by day</h2>
        <div class="psa-table">
          <table>
            <thead><tr><th>Date</th><th>Name</th><th>In</th><th>Out</th><th>Hours</th></tr></thead>
            <tbody>
              @for (d of r.days; track d.onDate + '-' + d.staffId) {
                <tr>
                  <td>{{ d.onDate | date: 'EEE d MMM' }}</td>
                  <td>{{ d.staffName }}</td>
                  <td>{{ d.firstIn ? (d.firstIn | date: 'h:mm a') : '—' }}</td>
                  <td>@if (d.missingOut) { <span class="psa-warn">Not marked out</span> } @else { {{ d.lastOut ? (d.lastOut | date: 'h:mm a') : '—' }} }</td>
                  <td>{{ d.hours != null ? (d.hours | number: '1.0-2') : '—' }}
                    @if (d.visits.length > 1) { <small class="app-muted">({{ d.visits.length }} visits)</small> }</td>
                </tr>
              } @empty {
                <tr><td colspan="5" class="app-muted">No attendance marked in these dates.</td></tr>
              }
            </tbody>
          </table>
        </div>
      </section>
    }
  `,
  styles: [`
    .psa-filter { display: flex; gap: 0.75rem; align-items: flex-end; flex-wrap: wrap; margin-bottom: 1rem; }
    .psa-filter label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.82rem; font-weight: 600; }
    .psa-quick { display: flex; gap: 0.4rem; }
    .psa-quick button { padding: 0.45rem 0.8rem; border: 1px solid var(--app-border); border-radius: 999px; background: #fff; font: inherit; font-size: 0.82rem; cursor: pointer; }
    section h2 { margin: 0 0 0.75rem; font-size: 1.05rem; }
    section + section { margin-top: 1rem; }
    .psa-table { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
    th, td { text-align: left; padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--app-border); white-space: nowrap; }
    th { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--app-text-muted); }
    .psa-ok { color: #2b7a2b; font-weight: 700; }
    .psa-bad { color: #b42318; font-weight: 700; }
    .psa-warn { color: #9a5b00; font-weight: 700; }
  `]
})
export class PreSchoolAttendanceReportComponent implements OnInit {
  private readonly attendance = inject(PreSchoolAttendanceService);

  from = monthStart(todayIso());
  to = todayIso();
  readonly report = signal<PreSchoolAttendanceReport | null>(null);
  readonly loading = signal(false);
  readonly hasData = computed(() => !!this.report());

  ngOnInit(): void { this.load(); }

  month(offset: number): void {
    this.from = monthStart(todayIso(), offset);
    this.to = offset === 0 ? todayIso() : monthEnd(this.from);
    this.load();
  }

  load(): void {
    if (!this.from || !this.to) return;
    this.loading.set(true);
    this.attendance.preSchoolReport(this.from, this.to).subscribe({
      next: r => { this.report.set(r); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  print(): void {
    const r = this.report();
    if (!r) return;
    const win = openPendingDocumentWindow(900, 960);
    const staff = r.staff.map(s => `<tr><td>${esc(s.staffName)}</td><td>${esc(s.role)}</td><td>${s.daysPresent}</td><td>${s.daysAbsent}</td><td>${s.totalHours.toFixed(2)}</td><td>${s.daysMissingOut}</td></tr>`).join('');
    const days = r.days.map(d => `<tr><td>${esc(d.onDate)}</td><td>${esc(d.staffName)}</td><td>${time(d.firstIn)}</td><td>${d.missingOut ? 'Not marked out' : time(d.lastOut)}</td><td>${d.hours != null ? d.hours.toFixed(2) : '—'}</td></tr>`).join('');
    writeDocumentWindow(win, `<!doctype html><html><head><meta charset="utf-8"><title>PreSchool staff attendance ${esc(r.from)} to ${esc(r.to)}</title>
      <style>body{font-family:Arial,sans-serif;color:#222;margin:24px}h1{margin:0;font-size:20px}h2{font-size:15px;margin:20px 0 6px}
      table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ccc;padding:5px 7px;text-align:left}th{background:#f3f0ff}
      .bar{margin-bottom:12px}@media print{.bar{display:none}}</style></head><body>
      <div class="bar"><button onclick="print()">Print / Save as PDF</button></div>
      <h1>Avijan PreSchool — Staff attendance</h1><p>${esc(r.from)} to ${esc(r.to)} · Sundays and PreSchool holidays are not counted as absent.</p>
      <h2>Summary</h2><table><tr><th>Name</th><th>Role</th><th>Present</th><th>Absent</th><th>Hours</th><th>Not marked out</th></tr>${staff}</table>
      <h2>Day by day</h2><table><tr><th>Date</th><th>Name</th><th>In</th><th>Out</th><th>Hours</th></tr>${days || '<tr><td colspan="5">No attendance marked.</td></tr>'}</table>
      </body></html>`);
  }
}
