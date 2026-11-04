import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';

import { PreSchoolEnquiry } from '../../../core/models/preschool.model';
import { PreSchoolService } from '../../../core/services/preschool.service';

/**
 * Admission enquiries sent from the public PreSchool page, for the PreSchool
 * admin and receptionist to call back. Separate from the Computer Centre's
 * course enquiries.
 */
@Component({
  selector: 'app-preschool-enquiries',
  standalone: true,
  imports: [DatePipe, FormsModule, ButtonModule],
  template: `
    <div class="app-page-head">
      <span class="app-eyebrow">Avijan PreSchool</span>
      <h1>Admission enquiries</h1>
      <p class="app-muted">Sent by parents from the PreSchool website. Call them back, then mark the enquiry as called.</p>
    </div>

    <label class="pse__toggle">
      <input type="checkbox" [ngModel]="showHandled()" (ngModelChange)="showHandled.set($event); load()" />
      Show enquiries already called back
    </label>

    <div class="pse__list">
      @for (e of list(); track e.id) {
        <article class="app-card pse__item" [class.pse__item--done]="e.isHandled">
          <div class="pse__main">
            <strong>{{ e.childName }}</strong>
            <span class="app-muted">
              @if (e.classWanted) { for {{ e.classWanted }} · }
              @if (e.childDateOfBirth) { born {{ e.childDateOfBirth | date: 'd MMM y' }} · }
              {{ e.createdOn | date: 'd MMM y, h:mm a' }}
            </span>
            <span>{{ e.parentName }} · <a [href]="'tel:' + e.phone">{{ e.phone }}</a>
              @if (e.email) { · <a [href]="'mailto:' + e.email">{{ e.email }}</a> }</span>
            @if (e.message) { <p class="pse__msg">{{ e.message }}</p> }
            @if (e.isHandled) { <small class="app-muted">Called back {{ e.handledOn | date: 'd MMM, h:mm a' }} by {{ e.handledBy }}</small> }
          </div>
          <div class="pse__actions">
            <a class="pse__wa" [href]="whatsApp(e)" target="_blank" rel="noopener" aria-label="WhatsApp the parent">
              <i class="pi pi-whatsapp" aria-hidden="true"></i></a>
            <p-button [label]="e.isHandled ? 'Reopen' : 'Called back'" [icon]="e.isHandled ? 'pi pi-undo' : 'pi pi-check'"
              size="small" [outlined]="e.isHandled" (onClick)="toggle(e)" />
          </div>
        </article>
      } @empty {
        @if (loaded()) { <p class="app-muted">No enquiries {{ showHandled() ? 'yet' : 'waiting for a call' }}.</p> }
      }
    </div>
  `,
  styles: [`
    .pse__toggle { display: inline-flex; gap: 0.45rem; align-items: center; margin-bottom: 1rem; font-size: 0.9rem; }
    .pse__list { display: flex; flex-direction: column; gap: 0.75rem; max-width: 52rem; }
    .pse__item { display: flex; justify-content: space-between; gap: 1rem; align-items: flex-start; }
    .pse__item--done { opacity: 0.7; }
    .pse__main { display: flex; flex-direction: column; gap: 0.2rem; min-width: 0; }
    .pse__main strong { font-size: 1.05rem; }
    .pse__msg { margin: 0.35rem 0 0; white-space: pre-wrap; }
    .pse__actions { display: flex; gap: 0.5rem; align-items: center; flex-shrink: 0; }
    .pse__wa { display: grid; place-items: center; width: 2.2rem; height: 2.2rem; border-radius: 50%; background: #25d366; color: #fff; text-decoration: none; }
    @media (max-width: 600px) { .pse__item { flex-direction: column; } }
  `]
})
export class PreSchoolEnquiriesComponent implements OnInit {
  private readonly preschool = inject(PreSchoolService);
  private readonly messages = inject(MessageService);

  readonly list = signal<PreSchoolEnquiry[]>([]);
  readonly showHandled = signal(false);
  readonly loaded = signal(false);

  ngOnInit(): void { this.load(); }

  load(): void {
    this.preschool.enquiries(this.showHandled()).subscribe(items => { this.list.set(items); this.loaded.set(true); });
  }

  toggle(e: PreSchoolEnquiry): void {
    this.preschool.setEnquiryHandled(e.id, !e.isHandled).subscribe(() => {
      this.messages.add({ severity: 'success', summary: e.isHandled ? 'Marked as open' : 'Marked as called back', life: 2500 });
      this.load();
    });
  }

  /** A WhatsApp chat with the parent; Indian numbers without a country code get 91. */
  whatsApp(e: PreSchoolEnquiry): string {
    const digits = e.phone.replace(/\D/g, '');
    const number = digits.length === 10 ? `91${digits}` : digits;
    const text = `Hello ${e.parentName}, thank you for your enquiry about ${e.childName} at Avijan PreSchool.`;
    return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
  }
}
