import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { Observable } from 'rxjs';

import { MarkListItem, MarkSaveRequest } from '../../core/models/academic.model';
import { ApiResponse } from '../../core/models/api-response.model';
import { AcademicService } from '../../core/services/academic.service';

/** The four subject slots the Marks table has columns for. */
const SLOTS = [1, 2, 3, 4] as const;

/**
 * Exam marks — the migration of `Views/Marks/Index.cshtml` and `Scripts/Marks.js`.
 *
 * Same four subject slots. The legacy form validated nothing, so marks obtained
 * could exceed the full marks; that is checked here and again on the server.
 */
@Component({
  selector: 'app-marks',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    ConfirmDialogModule,
    DatePickerModule,
    InputNumberModule,
    InputTextModule,
    TableModule,
    TagModule,
    TooltipModule
  ],
  providers: [ConfirmationService],
  templateUrl: './marks.component.html',
  styleUrl: './marks.component.scss'
})
export class MarksComponent {
  private readonly fb = inject(FormBuilder);
  private readonly academics = inject(AcademicService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly slots = SLOTS;

  readonly rows = signal<MarkListItem[]>([]);
  readonly totalCount = signal(0);
  readonly loading = signal(false);
  readonly saving = signal(false);

  readonly editingId = signal<number | null>(null);
  readonly isEditing = computed(() => this.editingId() !== null);

  readonly search = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(25);

  readonly today = new Date();

  readonly form = this.fb.nonNullable.group({
    registrationId: ['', [Validators.required, Validators.maxLength(15)]],
    examDate: [null as Date | null, [Validators.required]],

    subject1: [''], fullMarks1: [null as number | null], obtainedMarks1: [null as number | null],
    subject2: [''], fullMarks2: [null as number | null], obtainedMarks2: [null as number | null],
    subject3: [''], fullMarks3: [null as number | null], obtainedMarks3: [null as number | null],
    subject4: [''], fullMarks4: [null as number | null], obtainedMarks4: [null as number | null]
  });

  /** Running totals for whatever is typed, so the operator sees the result live. */
  readonly liveTotals = computed(() => {
    this.formTick();
    const v = this.form.getRawValue();

    let full = 0;
    let obtained = 0;

    for (const slot of SLOTS) {
      const subject = v[`subject${slot}` as const];
      if (!subject?.trim()) continue;

      full += v[`fullMarks${slot}` as const] ?? 0;
      obtained += v[`obtainedMarks${slot}` as const] ?? 0;
    }

    const percent = full > 0 ? Math.round((obtained * 100) / full * 100) / 100 : 0;

    return { full, obtained, percent };
  });

  /** Bumped on every form change so liveTotals recomputes. */
  private readonly formTick = signal(0);

  constructor() {
    this.load();
    this.form.valueChanges.subscribe(() => this.formTick.update(n => n + 1));
  }

  /* -------------------------------------------------------------- list */
  load(): void {
    this.loading.set(true);

    this.academics.marks(this.page(), this.pageSize(), null, this.search().trim() || null).subscribe({
      next: result => {
        this.rows.set(result.items);
        this.totalCount.set(result.totalCount);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  onLazyLoad(event: TableLazyLoadEvent): void {
    const size = event.rows ?? this.pageSize();
    const first = event.first ?? 0;

    this.pageSize.set(size);
    this.page.set(Math.floor(first / size) + 1);
    this.load();
  }

  runSearch(): void {
    this.page.set(1);
    this.load();
  }

  /* -------------------------------------------------------------- form */
  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.messages.add({
        severity: 'warn',
        summary: 'Check the form',
        detail: 'Registration id and date of examination are required.',
        life: 5000
      });
      return;
    }

    const problem = this.validateSubjects();
    if (problem) {
      this.messages.add({ severity: 'warn', summary: 'Check the marks', detail: problem, life: 6000 });
      return;
    }

    this.saving.set(true);

    const payload = this.toRequest();
    const id = this.editingId();

    const request$: Observable<ApiResponse<number | boolean>> = id === null
      ? this.academics.createMark(payload)
      : this.academics.updateMark(id, payload);

    request$.subscribe({
      next: response => {
        this.saving.set(false);
        this.messages.add({
          severity: 'success',
          summary: id === null ? 'Marks saved' : 'Marks updated',
          detail: response.message ?? 'Saved.',
          life: 5000
        });
        this.resetForm();
        this.load();
      },
      error: (error: unknown) => {
        this.saving.set(false);
        if (error instanceof HttpErrorResponse) {
          const body = error.error as ApiResponse<unknown> | null;
          const detail = body?.errors?.length ? body.errors.join(' ') : body?.message;
          if (detail) {
            this.messages.add({ severity: 'error', summary: 'Could not save', detail, life: 9000 });
          }
        }
      }
    });
  }

  edit(mark: MarkListItem): void {
    this.editingId.set(mark.id);

    const patch: Record<string, unknown> = {
      registrationId: mark.registrationId ?? '',
      examDate: mark.examDate ? new Date(mark.examDate) : null
    };

    // The API returns only the filled slots, so blank the rest.
    for (const slot of SLOTS) {
      const subject = mark.subjects[slot - 1];
      patch[`subject${slot}`] = subject?.subject ?? '';
      patch[`fullMarks${slot}`] = subject?.fullMarks ?? null;
      patch[`obtainedMarks${slot}`] = subject?.obtainedMarks ?? null;
    }

    this.form.patchValue(patch);

    document.getElementById('marks-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  resetForm(): void {
    this.form.reset({
      registrationId: '', examDate: null,
      subject1: '', fullMarks1: null, obtainedMarks1: null,
      subject2: '', fullMarks2: null, obtainedMarks2: null,
      subject3: '', fullMarks3: null, obtainedMarks3: null,
      subject4: '', fullMarks4: null, obtainedMarks4: null
    });

    this.editingId.set(null);
  }

  remove(mark: MarkListItem): void {
    this.confirm.confirm({
      header: 'Delete marks',
      message: `Delete the marks recorded for ${mark.registrationId} on ` +
               `${mark.examDate ? new Date(mark.examDate).toLocaleDateString('en-IN') : 'this date'}?`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.academics.deleteMark(mark.id).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: 'Deleted', life: 4000 });
            this.load();
          }
        });
      }
    });
  }

  /* ----------------------------------------------------------- helpers */

  /** Mirrors the server rules so the operator gets told before a round trip. */
  private validateSubjects(): string | null {
    const v = this.form.getRawValue();
    let anyFilled = false;

    for (const slot of SLOTS) {
      const subject = v[`subject${slot}` as const]?.trim();
      if (!subject) continue;

      anyFilled = true;

      const full = v[`fullMarks${slot}` as const];
      const obtained = v[`obtainedMarks${slot}` as const];

      if (full === null) return `Subject ${slot}: enter the full marks.`;
      if (obtained === null) return `Subject ${slot}: enter the marks obtained.`;
      if (full <= 0) return `Subject ${slot}: full marks must be greater than zero.`;
      if (obtained < 0) return `Subject ${slot}: marks obtained cannot be negative.`;
      if (obtained > full) return `Subject ${slot}: marks obtained cannot exceed the full marks.`;
    }

    return anyFilled ? null : 'Enter at least one subject.';
  }

  private toRequest(): MarkSaveRequest {
    const v = this.form.getRawValue();

    const request: Record<string, unknown> = {
      registrationId: v.registrationId.trim().toUpperCase(),
      examDate: this.toIsoDate(v.examDate)
    };

    for (const slot of SLOTS) {
      const subject = v[`subject${slot}` as const]?.trim();

      // An empty subject clears its marks, so a cleared slot leaves nothing behind.
      request[`subject${slot}`] = subject || null;
      request[`fullMarks${slot}`] = subject ? v[`fullMarks${slot}` as const] : null;
      request[`obtainedMarks${slot}`] = subject ? v[`obtainedMarks${slot}` as const] : null;
    }

    return request as unknown as MarkSaveRequest;
  }

  private toIsoDate(date: Date | null): string | null {
    if (!date) return null;

    const month = `${date.getMonth() + 1}`.padStart(2, '0');
    const day = `${date.getDate()}`.padStart(2, '0');

    return `${date.getFullYear()}-${month}-${day}`;
  }

  /** Grade band for the percentage tag. */
  scoreSeverity(percent: number): 'success' | 'info' | 'warn' | 'danger' {
    if (percent >= 75) return 'success';
    if (percent >= 50) return 'info';
    if (percent >= 33) return 'warn';
    return 'danger';
  }
}
