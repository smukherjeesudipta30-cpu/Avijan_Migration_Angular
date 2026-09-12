import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { TagModule } from 'primeng/tag';
import { forkJoin } from 'rxjs';

import { AttendanceShift, StaffRota } from '../../../core/models/attendance.model';
import { AttendanceService } from '../../../core/services/attendance.service';

/** Sunday first, matching System.DayOfWeek on the server so no translation is needed. */
const DAYS = [
  { value: 0, name: 'Sunday', short: 'Sun' },
  { value: 1, name: 'Monday', short: 'Mon' },
  { value: 2, name: 'Tuesday', short: 'Tue' },
  { value: 3, name: 'Wednesday', short: 'Wed' },
  { value: 4, name: 'Thursday', short: 'Thu' },
  { value: 5, name: 'Friday', short: 'Fri' },
  { value: 6, name: 'Saturday', short: 'Sat' }
];

/**
 * The rota: who works which shift on which day.
 *
 * <p>A grid of days across and shifts down, ticked. That shape is what lets one
 * person hold two shifts on the same day — Ishani works Sunday morning and Sunday
 * evening — which a single "shift" dropdown per person could not express.</p>
 *
 * <p>What is ticked here decides when somebody's day is written off as leave, so
 * the deadline for each shift is shown in the grid rather than left to memory.</p>
 */
@Component({
  selector: 'app-attendance-rota',
  imports: [CommonModule, FormsModule, ButtonModule, SelectModule, TagModule],
  templateUrl: './attendance-rota.component.html',
  styleUrl: './attendance-rota.component.scss'
})
export class AttendanceRotaComponent {
  private readonly attendance = inject(AttendanceService);
  private readonly messages = inject(MessageService);

  readonly days = DAYS;

  readonly shifts = signal<AttendanceShift[]>([]);
  readonly staff = signal<StaffRota[]>([]);
  readonly loading = signal(false);
  readonly saving = signal<number | null>(null);

  readonly staffType = signal<string>('Receptionist');

  readonly staffTypes = [
    { label: 'Receptionists', value: 'Receptionist' },
    { label: 'Teachers', value: 'Teacher' }
  ];

  /** Ticks held as "staffKey|day|shift", the cheapest thing to look up per cell. */
  private readonly ticks = signal<Set<string>>(new Set());

  readonly anyStaff = computed(() => this.staff().length > 0);

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);

    forkJoin({
      shifts: this.attendance.shifts(),
      staff: this.attendance.rota(this.staffType())
    }).subscribe({
      next: ({ shifts, staff }) => {
        this.shifts.set(shifts.filter(s => s.isActive));
        this.staff.set(staff);

        const ticked = new Set<string>();
        for (const person of staff) {
          for (const line of person.lines) {
            ticked.add(this.key(person, line.dayOfWeek, line.shiftId));
          }
        }
        this.ticks.set(ticked);

        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  key(person: StaffRota, day: number, shiftId: number): string {
    return `${person.staffType}:${person.staffId}|${day}|${shiftId}`;
  }

  isOn(person: StaffRota, day: number, shiftId: number): boolean {
    return this.ticks().has(this.key(person, day, shiftId));
  }

  toggle(person: StaffRota, day: number, shiftId: number): void {
    const k = this.key(person, day, shiftId);

    this.ticks.update(current => {
      const next = new Set(current);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  /** Whole row on or off — a five-day rota is otherwise five taps. */
  toggleShiftRow(person: StaffRota, shiftId: number, on: boolean): void {
    this.ticks.update(current => {
      const next = new Set(current);

      for (const day of DAYS) {
        const k = this.key(person, day.value, shiftId);
        if (on) next.add(k);
        else next.delete(k);
      }

      return next;
    });
  }

  save(person: StaffRota): void {
    this.saving.set(person.staffId);

    const lines: { dayOfWeek: number; shiftId: number }[] = [];

    for (const day of DAYS) {
      for (const shift of this.shifts()) {
        if (this.isOn(person, day.value, shift.id)) {
          lines.push({ dayOfWeek: day.value, shiftId: shift.id });
        }
      }
    }

    this.attendance
      .saveRota({ staffType: person.staffType, staffId: person.staffId, lines })
      .subscribe({
        next: () => {
          this.saving.set(null);
          this.messages.add({
            severity: 'success',
            summary: 'Rota saved',
            detail: `${person.staffName}: ${lines.length} shift(s) a week.`,
            life: 4000
          });
        },
        error: () => this.saving.set(null)
      });
  }

  /**
   * "10:00:00" from SQL's time type, shown as "10:00". Seconds are noise on a rota
   * and make each chip wide enough to wrap on a phone.
   */
  hhmm(time: string): string {
    return time?.length >= 5 ? time.slice(0, 5) : time;
  }

  /** A short human summary under each name, so the grid can be read at a glance. */
  summary(person: StaffRota): string {
    const parts: string[] = [];

    for (const shift of this.shifts()) {
      const days = DAYS.filter(d => this.isOn(person, d.value, shift.id)).map(d => d.short);
      if (days.length > 0) parts.push(`${shift.name}: ${days.join(', ')}`);
    }

    return parts.length > 0 ? parts.join('  ·  ') : 'No shifts set';
  }
}
