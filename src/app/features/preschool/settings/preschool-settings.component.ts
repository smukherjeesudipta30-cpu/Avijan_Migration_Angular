import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { PreSchoolSettings, PreSchoolSettingsSave } from '../../../core/models/preschool.model';
import { PreSchoolService } from '../../../core/services/preschool.service';

interface BandDraft {
  minPercent: number | null;
  grade: string;
  remark: string;
}

/**
 * The PreSchool's own settings, PreSchool admin only: contact details for its
 * home page and receipts, the uniform shop parents are sent to, the receipt
 * number prefix and the grade table for report cards.
 */
@Component({
  selector: 'app-preschool-settings',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule, InputTextModule],
  template: `
    <div class="app-page-head">
      <span class="app-eyebrow">Avijan PreSchool</span>
      <h1>School settings</h1>
      <p class="app-muted">Shown on the PreSchool home page, its receipts and report cards.</p>
    </div>

    @if (form(); as f) {
      <div class="pss">
        <section class="app-card">
          <h2>School</h2>
          <div class="pss__form">
            <label class="pss__wide">School name <input pInputText [(ngModel)]="f.schoolName" maxlength="150" /></label>
            <label class="pss__wide">Address <textarea pInputText rows="2" [(ngModel)]="f.address" maxlength="400"></textarea></label>
            <label>Phone <input pInputText [(ngModel)]="f.phone" maxlength="50" /></label>
            <label>Email <input pInputText type="email" [(ngModel)]="f.email" maxlength="150" /></label>
            <label class="pss__wide">Google Maps link <input pInputText [(ngModel)]="f.mapUrl" placeholder="https://maps.app.goo.gl/..." maxlength="500" /></label>
            <label>Champahati opening date
              <input pInputText type="date" [(ngModel)]="f.opensOn" />
              <small class="app-muted">Until this day both websites say the Champahati centre is coming soon
                (with this date). From this day the tagline goes. Leave empty for "coming soon" without a date.</small></label>
            <label>Receipt number prefix
              <input pInputText [(ngModel)]="f.receiptPrefix" maxlength="10" />
              <small class="app-muted">Receipts read {{ (f.receiptPrefix || 'APS').toUpperCase() }}/0001, /0002 …</small></label>
          </div>
        </section>

        <section class="app-card">
          <h2>Recommended uniform shop</h2>
          <p class="app-muted pss__note">Avijan does not sell uniforms. Parents see this shop on the PreSchool home page.</p>
          <div class="pss__form">
            <label class="pss__wide">Shop name <input pInputText [(ngModel)]="f.uniformShopName" maxlength="150" /></label>
            <label class="pss__wide">Address <textarea pInputText rows="2" [(ngModel)]="f.uniformShopAddress" maxlength="400"></textarea></label>
            <label>Phone <input pInputText [(ngModel)]="f.uniformShopPhone" maxlength="50" /></label>
            <label>Google Maps link <input pInputText [(ngModel)]="f.uniformShopMapUrl" placeholder="https://maps.app.goo.gl/..." maxlength="500" /></label>
          </div>
        </section>

        <div class="pss__actions">
          <p-button label="Save settings" icon="pi pi-check" [loading]="saving()" (onClick)="save(f)" />
          @if (saved()?.modifiedOn; as on) {
            <small class="app-muted">Last changed {{ on | date: 'd MMM y, h:mm a' }}@if (saved()?.modifiedBy; as by) { by {{ by }} }</small>
          }
        </div>

        <section class="app-card">
          <h2>Grades on the report card</h2>
          <p class="app-muted pss__note">A child's percentage gets the highest grade it reaches. The lowest grade must start at 0%.</p>
          <div class="pss__bands">
            <div class="pss__band pss__band--head"><span>From %</span><span>Grade</span><span>Remark</span><span></span></div>
            @for (b of bands(); track $index) {
              <div class="pss__band">
                <input pInputText type="number" min="0" max="100" [(ngModel)]="b.minPercent" aria-label="From percent" />
                <input pInputText [(ngModel)]="b.grade" maxlength="10" aria-label="Grade" />
                <input pInputText [(ngModel)]="b.remark" maxlength="80" aria-label="Remark" />
                <p-button icon="pi pi-times" [rounded]="true" [text]="true" severity="secondary"
                  ariaLabel="Remove grade" (onClick)="removeBand($index)" />
              </div>
            }
          </div>
          <div class="pss__actions">
            <p-button label="Add grade" icon="pi pi-plus" [text]="true" size="small" (onClick)="addBand()" />
            <p-button label="Save grades" icon="pi pi-check" [loading]="savingBands()" (onClick)="saveBands()" />
          </div>
        </section>
      </div>
    }
  `,
  styles: [`
    .pss { display: flex; flex-direction: column; gap: 1rem; max-width: 52rem; }
    .pss h2 { margin: 0 0 0.75rem; font-size: 1.05rem; }
    .pss__note { margin: -0.4rem 0 0.75rem; font-size: 0.85rem; }
    .pss__form { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
    .pss__form label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.82rem; font-weight: 600; }
    .pss__form small { font-weight: 400; }
    .pss__wide { grid-column: 1 / -1; }
    .pss__actions { display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap; margin-top: 0.6rem; }
    .pss__bands { display: flex; flex-direction: column; gap: 0.4rem; }
    .pss__band { display: grid; grid-template-columns: 6rem 6rem 1fr 2.5rem; gap: 0.5rem; align-items: center; }
    .pss__band input { width: 100%; min-width: 0; }
    .pss__band--head span { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: var(--app-text-muted); }
    @media (max-width: 640px) { .pss__form { grid-template-columns: 1fr; } .pss__band { grid-template-columns: 4.5rem 4.5rem 1fr 2.5rem; } }
  `]
})
export class PreSchoolSettingsComponent implements OnInit {
  private readonly preschool = inject(PreSchoolService);
  private readonly messages = inject(MessageService);

  readonly form = signal<PreSchoolSettingsSave | null>(null);
  readonly saved = signal<PreSchoolSettings | null>(null);
  readonly bands = signal<BandDraft[]>([]);
  readonly saving = signal(false);
  readonly savingBands = signal(false);

  ngOnInit(): void {
    this.preschool.overview().subscribe(o => {
      this.applySettings(o.settings);
      this.bands.set(o.gradeBands.map(b => ({ minPercent: b.minPercent, grade: b.grade, remark: b.remark ?? '' })));
    });
  }

  save(f: PreSchoolSettingsSave): void {
    if (!f.schoolName?.trim()) { this.warn('Give the school\'s name.'); return; }
    if (!/^[A-Za-z0-9-]+$/.test(f.receiptPrefix ?? '')) { this.warn('The receipt prefix can only use letters, digits and "-".'); return; }
    for (const link of [f.mapUrl, f.uniformShopMapUrl]) {
      if (link?.trim() && !/^https:\/\//i.test(link.trim())) { this.warn('A map link must start with https://.'); return; }
    }
    this.saving.set(true);
    // A cleared date input gives "", which the API cannot read as a date.
    this.preschool.saveSettings({ ...f, opensOn: f.opensOn || null }).subscribe({
      next: s => { this.saving.set(false); this.applySettings(s); this.done('Settings saved.'); },
      error: () => this.saving.set(false)
    });
  }

  addBand(): void {
    this.bands.update(list => [...list, { minPercent: null, grade: '', remark: '' }]);
  }

  removeBand(index: number): void {
    this.bands.update(list => list.filter((_, i) => i !== index));
  }

  saveBands(): void {
    const list = this.bands();
    if (list.length === 0) { this.warn('Add at least one grade.'); return; }
    if (list.some(b => !b.grade.trim() || b.minPercent === null || b.minPercent < 0 || b.minPercent > 100)) {
      this.warn('Every grade needs a name and a starting percentage from 0 to 100.');
      return;
    }
    if (!list.some(b => Number(b.minPercent) === 0)) { this.warn('The lowest grade must start at 0%.'); return; }
    this.savingBands.set(true);
    this.preschool.saveGradeBands(list.map(b => ({ minPercent: Number(b.minPercent), grade: b.grade.trim(), remark: b.remark.trim() || null })))
      .subscribe({
        next: saved => {
          this.savingBands.set(false);
          this.bands.set(saved.map(b => ({ minPercent: b.minPercent, grade: b.grade, remark: b.remark ?? '' })));
          this.done('Grades saved.');
        },
        error: () => this.savingBands.set(false)
      });
  }

  private applySettings(s: PreSchoolSettings): void {
    this.saved.set(s);
    const { modifiedBy: _by, modifiedOn: _on, ...editable } = s;
    this.form.set({ ...editable });
  }

  private done(summary: string): void {
    this.messages.add({ severity: 'success', summary, life: 2500 });
  }

  private warn(detail: string): void {
    this.messages.add({ severity: 'warn', summary: 'Please check', detail, life: 4000 });
  }
}
