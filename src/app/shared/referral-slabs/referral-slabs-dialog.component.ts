import { CommonModule } from '@angular/common';
import { Component, effect, inject, model, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService, SharedModule } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';

import { ReferralSlab } from '../../core/models/referral.model';
import { ReferralService } from '../../core/services/referral.service';

/**
 * Admin's editor for the admission referral slabs: from each admission fee
 * upward, the referrer earns its percentage. Below the lowest slab there is no
 * referral. A change applies to students admitted from then on; students
 * already admitted keep the rate locked in when they were admitted.
 */
@Component({
  selector: 'app-referral-slabs-dialog',
  imports: [CommonModule, FormsModule, SharedModule, ButtonModule, DialogModule, InputNumberModule],
  template: `
    <p-dialog
      [visible]="visible()"
      (visibleChange)="visible.set($event)"
      [modal]="true"
      [style]="{ width: '30rem', maxWidth: '96vw' }"
      header="Admission referral slabs">

      <p class="rs__lede">
        From each admission fee upward, the referring teacher or receptionist earns
        this percentage of the fee as it is collected. Below the lowest slab there is
        no referral. Changes apply to new admissions only.
      </p>

      <div class="rs__head">
        <span>Admission fee from (₹)</span>
        <span>Referral %</span>
        <span></span>
      </div>

      @for (slab of slabs(); track $index) {
        <div class="rs__row">
          <p-inputNumber [(ngModel)]="slab.minFee" [min]="1" [maxFractionDigits]="2" locale="en-IN" />
          <p-inputNumber [(ngModel)]="slab.percent" [min]="0" [max]="100" [maxFractionDigits]="2" suffix="%" />
          <p-button icon="pi pi-trash" severity="danger" [text]="true" (onClick)="remove($index)" />
        </div>
      }

      <p-button label="Add slab" icon="pi pi-plus" [text]="true" size="small" (onClick)="add()" />

      <ng-template pTemplate="footer">
        <p-button label="Cancel" severity="secondary" [text]="true" (onClick)="visible.set(false)" />
        <p-button label="Save" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </ng-template>
    </p-dialog>
  `,
  styles: `
    .rs__lede { font-size: 0.85rem; margin: 0 0 1rem; opacity: 0.8; }
    .rs__head, .rs__row {
      display: grid;
      grid-template-columns: 1fr 1fr 2.5rem;
      gap: 0.5rem;
      align-items: center;
    }
    .rs__head { font-size: 0.8rem; font-weight: 600; margin-bottom: 0.35rem; }
    .rs__row { margin-bottom: 0.5rem; }
    :host ::ng-deep .rs__row .p-inputnumber, :host ::ng-deep .rs__row input { width: 100%; }
  `
})
export class ReferralSlabsDialogComponent {
  private readonly api = inject(ReferralService);
  private readonly messages = inject(MessageService);

  readonly visible = model(false);
  /** Emitted with the saved slabs, so the caller's preview updates at once. */
  readonly saved = output<ReferralSlab[]>();

  readonly slabs = signal<ReferralSlab[]>([]);
  readonly saving = signal(false);

  constructor() {
    // Reload each time the dialog opens, so it never edits a stale copy.
    effect(() => {
      if (!this.visible()) return;
      this.api.settings().subscribe({
        next: s => this.slabs.set(s.slabs.map(x => ({ ...x }))),
        error: () => this.slabs.set([])
      });
    });
  }

  add(): void {
    this.slabs.update(s => [...s, { minFee: 0, percent: 0 }]);
  }

  remove(index: number): void {
    this.slabs.update(s => s.filter((_, i) => i !== index));
  }

  save(): void {
    this.saving.set(true);

    this.api.saveSettings(this.slabs()).subscribe({
      next: r => {
        this.saving.set(false);
        this.saved.emit(r.data.slabs);
        this.visible.set(false);
        this.messages.add({
          severity: 'success',
          summary: 'Referral slabs saved',
          detail: 'They apply to students admitted from now on.',
          life: 4000
        });
      },
      error: () => this.saving.set(false)
    });
  }
}
