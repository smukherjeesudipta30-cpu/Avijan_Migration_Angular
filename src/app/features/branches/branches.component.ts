import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CheckboxModule } from 'primeng/checkbox';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { Observable } from 'rxjs';

import { ApiResponse } from '../../core/models/api-response.model';
import { BranchListItem, BranchSaveRequest } from '../../core/models/master.model';
import { MasterService } from '../../core/services/master.service';

/**
 * Branch details.
 *
 * The legacy `Views/Branch/Index.cshtml` was an empty stub — the table existed but
 * had no screen. It matters now because the branch code becomes a segment of every
 * registration id issued for that branch, so it needs to be managed deliberately
 * rather than typed as free text on the student form.
 */
@Component({
  selector: 'app-branches',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    CheckboxModule,
    ConfirmDialogModule,
    InputTextModule,
    MessageModule,
    TableModule,
    TagModule,
    TooltipModule
  ],
  providers: [ConfirmationService],
  templateUrl: './branches.component.html',
  styleUrl: './branches.component.scss'
})
export class BranchesComponent {
  private readonly fb = inject(FormBuilder);
  private readonly masters = inject(MasterService);
  private readonly messages = inject(MessageService);
  private readonly confirm = inject(ConfirmationService);

  readonly rows = signal<BranchListItem[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);

  readonly editingId = signal<number | null>(null);
  readonly isEditing = computed(() => this.editingId() !== null);

  /** Set when editing a branch whose code is already baked into registration ids. */
  readonly codeLocked = signal(false);

  readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(50)]],
    code: ['', [Validators.required, Validators.maxLength(10), Validators.pattern(/^[A-Za-z0-9]+$/)]],
    isActive: [true],

    /* Attendance fence. Optional — a branch with no coordinates simply cannot take
       attendance, which is safer than defaulting to somewhere. */
    latitude: [null as number | null],
    longitude: [null as number | null],
    geofenceMetres: [150 as number]
  });

  /** Live preview of what a registration id will look like for this branch. */
  readonly samplePreview = computed(() => {
    const code = this.form.controls.code.value?.trim();
    const year = String(new Date().getFullYear()).slice(2);

    return code ? `AVI/${code}/3463/${year}` : `AVI/3463/${year}`;
  });

  constructor() {
    this.load();

    // Keep the preview reactive to typing.
    this.form.controls.code.valueChanges.subscribe(() => this.codePreviewTick.update(n => n + 1));
  }

  /** Bumped on every keystroke so the computed preview re-evaluates. */
  private readonly codePreviewTick = signal(0);

  load(): void {
    this.loading.set(true);

    this.masters.branches().subscribe({
      next: data => {
        this.rows.set(data);
        this.loading.set(false);
      },
      error: () => this.loading.set(false)
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.messages.add({
        severity: 'warn',
        summary: 'Check the form',
        detail: 'Branch name and code are both required.',
        life: 5000
      });
      return;
    }

    this.saving.set(true);

    const v = this.form.getRawValue();
    const payload: BranchSaveRequest = {
      name: v.name.trim(),
      code: v.code.trim(),
      isActive: v.isActive,
      latitude: v.latitude ?? null,
      longitude: v.longitude ?? null,
      geofenceMetres: v.geofenceMetres ?? 150
    };

    const id = this.editingId();

    const request$: Observable<ApiResponse<number | boolean>> = id === null
      ? this.masters.createBranch(payload)
      : this.masters.updateBranch(id, payload);

    request$.subscribe({
      next: response => {
        this.saving.set(false);
        this.messages.add({
          severity: 'success',
          summary: id === null ? 'Branch added' : 'Branch updated',
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

  edit(branch: BranchListItem): void {
    this.editingId.set(branch.id);
    this.codeLocked.set(branch.issuedRegistrations > 0);

    this.form.patchValue({
      name: branch.name ?? '',
      code: branch.code ?? '',
      isActive: branch.isActive,
      latitude: branch.latitude ?? null,
      longitude: branch.longitude ?? null,
      geofenceMetres: branch.geofenceMetres ?? 150
    });

    // A code already present in issued registration ids cannot change without
    // orphaning those students, so the server refuses it — reflect that here.
    if (branch.issuedRegistrations > 0) {
      this.form.controls.code.disable();
    } else {
      this.form.controls.code.enable();
    }

    document.getElementById('branch-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  resetForm(): void {
    this.form.enable();
    this.form.reset({
      name: '', code: '', isActive: true,
      latitude: null, longitude: null, geofenceMetres: 150
    });
    this.editingId.set(null);
    this.codeLocked.set(false);
  }

  toggleStatus(branch: BranchListItem): void {
    const next = !branch.isActive;

    this.confirm.confirm({
      header: next ? 'Activate branch' : 'Deactivate branch',
      message: next
        ? `Make ${branch.name} selectable on the student form again?`
        : `Hide ${branch.name} from the student form? Existing students keep their branch.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: next ? 'Activate' : 'Deactivate',
      rejectLabel: 'Cancel',
      acceptButtonStyleClass: next ? 'p-button-success' : 'p-button-danger',
      accept: () => {
        this.masters.setBranchStatus(branch.id, next).subscribe({
          next: () => {
            this.messages.add({
              severity: 'success',
              summary: next ? 'Activated' : 'Deactivated',
              life: 4000
            });
            this.load();
          }
        });
      }
    });
  }
}
