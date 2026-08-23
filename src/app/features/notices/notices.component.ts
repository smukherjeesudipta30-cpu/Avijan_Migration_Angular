import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DatePickerModule } from 'primeng/datepicker';
import { InputTextModule } from 'primeng/inputtext';
import { TableLazyLoadEvent, TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { TooltipModule } from 'primeng/tooltip';
import { Observable } from 'rxjs';

import { NoticeListItem, NoticeSaveRequest } from '../../core/models/academic.model';
import { ApiResponse } from '../../core/models/api-response.model';
import { AcademicService } from '../../core/services/academic.service';

/**
 * Notice board — the migration of `Views/Notice/Index.cshtml` and `Scripts/Notice.js`.
 *
 * The legacy form was a single-line `<input>` for the notice text and stamped the
 * date server-side on every save, including edits — so fixing a typo silently moved
 * the notice back to the top of the board. Here the text is a textarea and the date
 * is only changed when you deliberately change it.
 */
@Component({
  selector: 'app-notices',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    ConfirmDialogModule,
    DatePickerModule,
    InputTextModule,
    TableModule,
    TagModule,
    TextareaModule,
    TooltipModule
  ],
  providers: [ConfirmationService],
  templateUrl: './notices.component.html',
  styleUrl: './notices.component.scss'
})
export class NoticesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly academics = inject(AcademicService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly rows = signal<NoticeListItem[]>([]);
  readonly totalCount = signal(0);
  readonly loading = signal(false);
  readonly saving = signal(false);

  readonly editingId = signal<number | null>(null);
  readonly isEditing = computed(() => this.editingId() !== null);

  readonly search = signal('');
  readonly page = signal(1);
  readonly pageSize = signal(25);

  readonly form = this.fb.nonNullable.group({
    text: ['', [Validators.required, Validators.maxLength(4000)]],
    noticeDate: [null as Date | null]
  });

  /** Characters left, since the column is capped at 4000. */
  readonly remaining = computed(() => {
    this.formTick();
    return 4000 - (this.form.controls.text.value?.length ?? 0);
  });

  private readonly formTick = signal(0);

  constructor() {
    this.load();
    this.form.controls.text.valueChanges.subscribe(() => this.formTick.update(n => n + 1));
  }

  /* -------------------------------------------------------------- list */
  load(): void {
    this.loading.set(true);

    this.academics.notices(this.page(), this.pageSize(), this.search().trim() || null).subscribe({
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
        detail: 'Notice text is required.',
        life: 5000
      });
      return;
    }

    this.saving.set(true);

    const v = this.form.getRawValue();

    const payload: NoticeSaveRequest = {
      text: v.text.trim(),
      // Null on create means "stamp now"; on update it means "leave the date alone".
      noticeDate: v.noticeDate ? this.toIsoDateTime(v.noticeDate) : null
    };

    const id = this.editingId();

    const request$: Observable<ApiResponse<number | boolean>> = id === null
      ? this.academics.createNotice(payload)
      : this.academics.updateNotice(id, payload);

    request$.subscribe({
      next: response => {
        this.saving.set(false);
        this.messages.add({
          severity: 'success',
          summary: id === null ? 'Notice published' : 'Notice updated',
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
            this.messages.add({ severity: 'error', summary: 'Could not save', detail, life: 8000 });
          }
        }
      }
    });
  }

  edit(notice: NoticeListItem): void {
    this.editingId.set(notice.id);

    this.form.patchValue({
      text: notice.text ?? '',
      noticeDate: notice.noticeDate ? new Date(notice.noticeDate) : null
    });

    document.getElementById('notice-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  resetForm(): void {
    this.form.reset({ text: '', noticeDate: null });
    this.editingId.set(null);
  }

  remove(notice: NoticeListItem): void {
    this.confirm.confirm({
      header: 'Delete notice',
      message: 'Delete this notice? It will disappear from the dashboard board too.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Delete',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: 'p-button-danger',
      accept: () => {
        this.academics.deleteNotice(notice.id).subscribe({
          next: () => {
            this.messages.add({ severity: 'success', summary: 'Deleted', life: 4000 });
            this.load();
          }
        });
      }
    });
  }

  /** Flags the notices the dashboard board will actually show (the newest five). */
  isOnBoard(index: number): boolean {
    return this.page() === 1 && index < 5;
  }

  private toIsoDateTime(date: Date): string {
    const pad = (n: number) => `${n}`.padStart(2, '0');

    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
           `T${pad(date.getHours())}:${pad(date.getMinutes())}:00`;
  }
}
