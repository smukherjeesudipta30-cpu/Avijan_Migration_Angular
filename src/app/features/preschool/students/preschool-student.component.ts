import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { Observable, concatMap, from, last, of } from 'rxjs';

import { formatMoney } from '../../../core/format/money';
import { PreSchoolClass, todayIso } from '../../../core/models/preschool.model';
import {
  PRESCHOOL_CHARGE_HEADS, PRESCHOOL_MAX_INSTALMENTS, PRESCHOOL_OTHERS_ROW, PreSchoolChargeHead, PreSchoolMonth, PreSchoolPayMode,
  PreSchoolPhotoSlot, PreSchoolReceipt, PreSchoolReceiptSummary, PreSchoolStudentDetail, PreSchoolStudentPhotos, PreSchoolStudentSave,
  monthLabel, whatsAppLink
} from '../../../core/models/preschool-student.model';
import { openPendingDocumentWindow, writeDocumentWindow } from '../../../core/printing/legacy-documents';
import { downloadSizedPdf, isNativeApp, pdfFileName } from '../../../core/printing/pdf-download';
import { feeReceiptHtml } from '../../../core/printing/preschool-forms';
import { PhotoCaptureComponent } from '../../../shared/photo-capture/photo-capture.component';
import { AuthService } from '../../../core/services/auth.service';
import { PreSchoolService } from '../../../core/services/preschool.service';
import { PreSchoolStudentService } from '../../../core/services/preschool-student.service';
import { PreSchoolStoreService, PreSchoolStudentStoreLine } from '../../../core/services/preschool-store.service';

const blankForm = (): PreSchoolStudentSave => ({
  childName: '', dateOfBirth: '', gender: null, bloodGroup: null, fatherName: null, motherName: null,
  parentName: '', phone: '', emergencyPhone: null, email: null, address: null,
  guardianRelation: null, guardian2Name: null, guardian2Relation: null, guardian2Phone: null, heightCm: null, weightKg: null, classId: 0,
  joinedOn: todayIso(), monthlyDiscount: 0, status: 'Active', endedOn: null, notes: null, section: null
});

/** The receipt's other rows, blank: an amount (and a note for "Late fee / others" and "Others") per head. */
const blankCharges = () =>
  Object.fromEntries(PRESCHOOL_CHARGE_HEADS.map(h => [h.head, { amount: null as number | null, note: '' }])) as
    Record<PreSchoolChargeHead, { amount: number | null; note: string }>;

/** "2026-11-01" plus n months. */
function addMonths(iso: string, n: number): string {
  const [y, m] = iso.split('-').map(Number);
  const d = new Date(y, m - 1 + n, 1);
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-01`;
}

/**
 * One PreSchool child: the admission form for a new child, and for an admitted
 * one their months, fee collection, receipts and details. Collecting opens the
 * receipt at once, ready to print or save as PDF.
 */
@Component({
  selector: 'app-preschool-student',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, ButtonModule, InputTextModule, PhotoCaptureComponent],
  template: `
    <a routerLink="/preschool/students" class="psd-back"><i class="pi pi-arrow-left" aria-hidden="true"></i> Students</a>

    @if (isNew()) {
      <div class="app-page-head">
        <span class="app-eyebrow">Avijan PreSchool</span>
        <h1>New admission</h1>
        <p class="app-muted">Save the admission first; the admission fee and months are collected on the next screen.</p>
      </div>
    }
    @if (!isNew() && student(); as s) {
      <div class="app-page-head psd-title">
        <div>
          <span class="app-eyebrow">{{ s.admissionCode }} · {{ s.className }}</span>
          <h1>{{ s.childName }}</h1>
          <p class="app-muted">{{ s.parentName }} · <a [href]="'tel:' + s.phone">{{ s.phone }}</a> · joined {{ s.joinedOn | date: 'd MMM y' }}
            @if (s.status !== 'Active') { · <strong>{{ s.status }}</strong> }</p>
        </div>
      </div>
    }

    <div class="psd" [class.psd--new]="isNew()">
      @if (!isNew() && student(); as s) {
        <section class="app-card psd-fees">
          <div class="psd-fee-head">
            <h2>Collect fees</h2>
            <span>Monthly fee <strong>{{ money(s.monthlyFee) }}</strong>@if (s.monthlyDiscount > 0) { <small>(after {{ money(s.monthlyDiscount) }} discount)</small> }</span>
          </div>

          @if (s.monthlyFee === 0 && !s.admissionFee) {
            <p class="psd-warn">{{ s.className }} has no fees set yet. Set them in Classes &amp; Fees first.</p>
          }

          @if (!s.admissionPaid && hasRates()) {
            <div class="psd-package">
              <span><strong>Admission package</strong>
                <small>Admission fee, first month's tuition and every usual charge for {{ s.className }}
                  — {{ money(packageTotal(s)) }}</small></span>
              <p-button label="Fill admission package" icon="pi pi-list-check" size="small" [outlined]="true" (onClick)="fillPackage(s)" />
            </div>
          }

          @if (s.admissionFee > 0 || !s.admissionPaid) {
            <div class="psd-adm" [class.psd-adm--paid]="s.admissionPaid">
              @if (s.admissionPaid) {
                <span><i class="pi pi-check-circle" aria-hidden="true"></i> Admission fee received</span>
              } @else {
                <label><input type="checkbox" [(ngModel)]="takeAdmission" /> Admission fee</label>
                <input pInputText type="number" min="1" [(ngModel)]="admissionAmount" [disabled]="!takeAdmission" aria-label="Admission amount" />
              }
            </div>
          }

          <p class="psd-label">Months <small class="app-muted">— tick the months being paid</small></p>
          <div class="psd-months">
            @for (m of monthChoices(); track m.month) {
              @if (m.isPaid) {
                <span class="psd-month psd-month--paid" [title]="'Paid on ' + m.receiptCode">{{ label(m.month) }}<small>{{ m.receiptCode }}</small></span>
              } @else {
                <label class="psd-month" [class.psd-month--on]="picked().has(m.month)" [class.psd-month--late]="m.month < thisMonth">
                  <input type="checkbox" [checked]="picked().has(m.month)" (change)="toggle(m.month)" />
                  {{ label(m.month) }}<small>{{ m.month < thisMonth ? 'overdue' : m.month === thisMonth ? 'this month' : 'advance' }}</small>
                </label>
              }
            }
          </div>

          <details class="psd-charges" [open]="chargesTotal() > 0 || hasRates()">
            <summary>Other charges on the receipt <small class="app-muted">— registration, annual, kit, food, transport…</small>
              @if (chargesTotal() > 0) { <strong>{{ money(chargesTotal()) }}</strong> }</summary>
            @for (part of [1, 2]; track part) {
              <p class="psd-part">Part {{ part === 1 ? 'I' : 'II' }}</p>
              <div class="psd-charge-grid">
                @for (h of chargeHeads; track h.head) {
                  @if (h.part === part) {
                    <label class="psd-charge" [class.psd-charge--on]="(charges[h.head].amount ?? 0) > 0">
                      <span><input type="checkbox" [checked]="(charges[h.head].amount ?? 0) > 0" (change)="toggleCharge(h.head)"
                        [attr.aria-label]="'Charge ' + h.label" /> {{ h.label }}@if (rateOf(h.head); as rate) { <small>usual {{ money(rate) }}</small> }</span>
                      <input pInputText type="number" min="0" step="1" [(ngModel)]="charges[h.head].amount" placeholder="0" /></label>
                    @if (printsInOthers(h.head)) { <small class="psd-in-others">prints in "Others"</small> }
                    @if (h.head === 'LateFee' || h.head === 'Others') {
                      <label>{{ h.head === 'LateFee' ? 'Late fee / other' : 'Other' }} — what for
                        <input pInputText [(ngModel)]="charges[h.head].note" maxlength="60" /></label>
                    }
                  }
                }
              </div>
            }
          </details>

          <div class="psd-pay">
            <div class="psd-modes" role="radiogroup" aria-label="Payment mode">
              @for (mode of modes; track mode) {
                <label [class.psd-mode--on]="payMode === mode"><input type="radio" name="mode" [value]="mode" [(ngModel)]="payMode" /> {{ mode }}</label>
              }
            </div>
            @if (payMode === 'UPI' || payMode === 'Paytm') {
              <label>{{ payMode }} reference <input pInputText [(ngModel)]="reference" maxlength="60" /></label>
            }
            @if (payMode === 'Cheque' || payMode === 'DD') {
              <label>{{ payMode }} No. <input pInputText [(ngModel)]="reference" maxlength="30" /></label>
              <label>{{ payMode }} date <input pInputText type="date" [(ngModel)]="chequeDate" /></label>
              <label class="psd-wide">Drawn on (bank) <input pInputText [(ngModel)]="drawnOn" maxlength="80" placeholder="State Bank of India, Baruipur" /></label>
            }
            <label>Date received <input pInputText type="date" [(ngModel)]="receivedOn" [max]="today" /></label>
            <label>Note (optional) <input pInputText [(ngModel)]="payNote" maxlength="300" /></label>
          </div>

          <div class="psd-disc">
            <label>Discount (%) <input pInputText type="number" min="0" max="100" step="0.5" [(ngModel)]="discountPercent" placeholder="0" /></label>
            <label>Special offer (₹) <input pInputText type="number" min="0" step="1" [(ngModel)]="specialOffer" placeholder="0" /></label>
            <label class="psd-wide">Offer name (printed on the receipt) <input pInputText [(ngModel)]="offerNote" maxlength="60" placeholder="e.g. Opening offer" /></label>
          </div>

          <div class="psd-inst" [class.psd-inst--on]="byInstalments">
            <label class="psd-inst-toggle"><input type="checkbox" [(ngModel)]="byInstalments" [disabled]="!canSplit()" />
              Pay in instalments <small>— up to {{ maxInstalments }}; the admission and registration fees only, not monthly fees alone</small></label>
            @if (byInstalments) {
              <label>Paid now — 1st instalment (₹) <input pInputText type="number" min="1" step="1" [(ngModel)]="paidNow" /></label>
              <span class="psd-inst-left">Balance after this: <strong>{{ money(balanceAfter()) }}</strong>
                <small>The receipt prints with blank rows for the next instalments; enter each one under Receipts when it is paid.</small></span>
            }
          </div>

          <div class="psd-total">
            <span class="psd-sum">
              @if (discountAmount() > 0 || offerAmount() > 0) {
                <small>Fees {{ money(gross()) }}
                  @if (discountAmount() > 0) { · less {{ discountPercent }}% {{ money(discountAmount()) }} }
                  @if (offerAmount() > 0) { · less offer {{ money(offerAmount()) }} }</small>
              }
              Total <strong>{{ money(total()) }}</strong>
              @if (byInstalments && paidNow) { <small>receiving {{ money(paidNow) }} now</small> }</span>
            <p-button label="Collect and print receipt" icon="pi pi-print" [loading]="collecting()" [disabled]="gross() <= 0" (onClick)="collect(s)" />
          </div>
        </section>
      }

      <section class="app-card psd-form">
        <h2>{{ isNew() ? 'Child and family' : 'Details' }}</h2>
        <div class="psd-grid">
          <label class="w2">Child's name * <input pInputText [(ngModel)]="form.childName" maxlength="100" /></label>
          <label>Date of birth * <input pInputText type="date" [(ngModel)]="form.dateOfBirth" [max]="today" /></label>
          <label>Gender
            <select [(ngModel)]="form.gender"><option [ngValue]="null">—</option><option value="Girl">Girl</option><option value="Boy">Boy</option></select></label>
          <label>Blood group <input pInputText [(ngModel)]="form.bloodGroup" maxlength="5" placeholder="B+" /></label>
          <label>Class *
            <select [(ngModel)]="form.classId">
              <option [ngValue]="0" disabled>Pick a class</option>
              @for (c of classes(); track c.id) { <option [ngValue]="c.id" [disabled]="!c.isActive">{{ c.name }}</option> }
            </select></label>
          <label>Section <input pInputText [(ngModel)]="form.section" maxlength="10" placeholder="A" /></label>
          <label>Joining date * <input pInputText type="date" [(ngModel)]="form.joinedOn" /></label>
          <label>Height (cm) <input pInputText type="number" min="40" max="200" step="0.5" [(ngModel)]="form.heightCm" placeholder="95" /></label>
          <label>Weight (kg) <input pInputText type="number" min="2" max="80" step="0.1" [(ngModel)]="form.weightKg" placeholder="14.5" /></label>
          <label>Father's name <input pInputText [(ngModel)]="form.fatherName" maxlength="100" /></label>
          <label>Mother's name <input pInputText [(ngModel)]="form.motherName" maxlength="100" /></label>

          <p class="psd-sub w2">Guardian 1 <small>— the parent the school calls</small></p>
          <label>Name * <input pInputText [(ngModel)]="form.parentName" maxlength="100" /></label>
          <label>Relation <input pInputText [(ngModel)]="form.guardianRelation" maxlength="30" list="psd-relations" placeholder="Mother" /></label>
          <label>Phone * <input pInputText type="tel" [(ngModel)]="form.phone" maxlength="15" placeholder="98300 00000" /></label>
          <label>Emergency phone <input pInputText type="tel" [(ngModel)]="form.emergencyPhone" maxlength="15" /></label>
          <label class="w2">Home address * <textarea pInputText rows="3" [(ngModel)]="form.address" maxlength="400"
            placeholder="House / flat, para or road, village or town, P.O., P.S., PIN"></textarea></label>
          <label>Email <input pInputText type="email" [(ngModel)]="form.email" maxlength="150" /></label>

          <p class="psd-sub w2">Guardian 2 <small>— a second person allowed to collect the child</small></p>
          <label>Name <input pInputText [(ngModel)]="form.guardian2Name" maxlength="100" /></label>
          <label>Relation <input pInputText [(ngModel)]="form.guardian2Relation" maxlength="30" list="psd-relations" placeholder="Father" /></label>
          <label>Phone <input pInputText type="tel" [(ngModel)]="form.guardian2Phone" maxlength="15" /></label>
          <datalist id="psd-relations">
            @for (r of relations; track r) { <option [value]="r"></option> }
          </datalist>

          <p class="psd-sub w2">Photos <small>— take them with the camera or choose from the gallery</small></p>
          <div class="psd-photos w2">
            <app-photo-capture label="Child" [(value)]="childPhoto" />
            <app-photo-capture label="Guardian 1" [(value)]="guardian1Photo" />
            <app-photo-capture label="Guardian 2" [(value)]="guardian2Photo" />
          </div>
          <p class="psd-sub w2">Other details</p>
          <label>Monthly discount (₹) <input pInputText type="number" min="0" [(ngModel)]="form.monthlyDiscount" /></label>
          @if (!isNew()) {
            <label>Status
              <select [(ngModel)]="form.status">
                <option value="Active">Studying</option><option value="Completed">Completed the class</option><option value="Left">Left</option>
              </select></label>
            @if (form.status !== 'Active') {
              <label>Completed / left on * <input pInputText type="date" [(ngModel)]="form.endedOn" /></label>
            }
          }
          <label class="w2">Notes <textarea pInputText rows="2" [(ngModel)]="form.notes" maxlength="500"></textarea></label>
        </div>
        <p-button [label]="isNew() ? 'Save admission' : 'Save details'" icon="pi pi-check" [loading]="saving()" (onClick)="save()" />
      </section>

      @if (!isNew() && student(); as s) {
        <section class="app-card psd-receipts">
          <h2>Store items</h2>
          @for (l of storeLines(); track l.itemId) {
            <div class="psd-store">
              <span><strong>{{ l.itemName }}</strong>
                @if (l.givenOn) { <small>Given {{ l.givenOn | date: 'd MMM y' }}@if (l.givenBy) { · {{ l.givenBy }} }</small> }
                @else { <small>{{ l.inStock }} in stock</small> }</span>
              @if (l.givenOn) {
                <span class="psd-store-ok"><i class="pi pi-check-circle" aria-hidden="true"></i> Given</span>
              } @else {
                <p-button label="Give" icon="pi pi-box" size="small" [outlined]="true" [disabled]="l.inStock <= 0"
                  [loading]="giving() === l.itemId" (onClick)="give(s, l.itemId, l.itemName)" />
              }
            </div>
          } @empty {
            <p class="app-muted">No store items set up for {{ s.className }}. Add them on the Store screen.</p>
          }
        </section>
      }

      @if (!isNew() && student(); as s) {
        <section class="app-card psd-receipts">
          <h2>Receipts</h2>
          @for (r of s.receipts; track r.id) {
            <div class="psd-receipt" [class.psd-receipt--void]="r.isCancelled">
              <span><strong>{{ r.receiptCode }}</strong> · {{ r.receivedOn | date: 'd MMM y' }} · {{ r.mode }}@if (r.isCancelled) { · <em>Cancelled</em> }
                <small>{{ r.summary }}</small></span>
              <span class="psd-receipt-amt"><strong>{{ money(r.total) }}</strong>
                @if (!r.isCancelled && (r.balance ?? 0) > 0) { <small class="psd-bal">Balance {{ money(r.balance ?? 0) }}</small> }
                @else if ((r.payments?.length ?? 0) > 1) { <small class="psd-paidup">Paid in {{ r.payments?.length }} parts</small> }</span>
              <span class="psd-receipt-actions">
                <p-button icon="pi pi-print" [text]="true" [rounded]="true" ariaLabel="Print receipt (parent and office copy)" (onClick)="print(r.id)" />
                <p-button icon="pi pi-file-pdf" [text]="true" [rounded]="true" ariaLabel="Download the parent copy as PDF"
                  [loading]="downloading() === r.id" (onClick)="downloadParentCopy(r.id)" />
                <a [href]="share(s, r.receiptCode, r.total, r.summary)" target="_blank" rel="noopener" class="psd-wa" aria-label="Send to parent on WhatsApp"><i class="pi pi-whatsapp" aria-hidden="true"></i></a>
                @if (isHead() && !r.isCancelled) {
                  <p-button icon="pi pi-ban" [text]="true" [rounded]="true" severity="danger" ariaLabel="Cancel receipt" (onClick)="cancel(r.id, r.receiptCode)" />
                }
              </span>
              @if ((r.payments?.length ?? 0) > 1 || (!r.isCancelled && (r.balance ?? 0) > 0)) {
                <div class="psd-parts">
                  @for (p of r.payments ?? []; track p.id) {
                    <span>#{{ p.instalmentNo }} · {{ p.paidOn | date: 'd MMM y' }} · {{ money(p.amount) }} · {{ p.mode }}@if (p.reference) { {{ p.reference }} }
                      <small>by {{ p.collectedBy || '—' }}</small></span>
                  }
                  @if (!r.isCancelled && (r.balance ?? 0) > 0) {
                    @if (instalmentFor() === r.id) {
                      <div class="psd-next">
                        <label>Amount (₹) <input pInputText type="number" min="1" [max]="r.balance ?? 0" [(ngModel)]="next.amount" /></label>
                        <label>Date <input pInputText type="date" [(ngModel)]="next.paidOn" [max]="today" /></label>
                        <label>Mode
                          <select [(ngModel)]="next.mode">@for (m of modes; track m) { <option [value]="m">{{ m }}</option> }</select></label>
                        @if (next.mode !== 'Cash') { <label>Reference / No. <input pInputText [(ngModel)]="next.reference" maxlength="60" /></label> }
                        <span class="psd-next-btns">
                          <p-button label="Save instalment" icon="pi pi-check" size="small" [loading]="savingInstalment()" (onClick)="saveInstalment(r)" />
                          <p-button label="Cancel" size="small" [text]="true" (onClick)="instalmentFor.set(null)" />
                        </span>
                      </div>
                    } @else {
                      <p-button [label]="'Receive instalment ' + ((r.payments?.length ?? 1) + 1)" icon="pi pi-plus" size="small" [outlined]="true"
                        (onClick)="startInstalment(r)" />
                    }
                  }
                </div>
              }
            </div>
          } @empty {
            <p class="app-muted">No money received yet.</p>
          }
        </section>
      }
    </div>
  `,
  styles: [`
    .psd-back { display: inline-flex; gap: 0.35rem; align-items: center; margin-bottom: 0.5rem; color: var(--app-text-muted); text-decoration: none; font-size: 0.9rem; }
    .psd { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 1rem; align-items: start; }
    .psd--new { grid-template-columns: minmax(0, 46rem); }
    .psd h2 { margin: 0 0 0.75rem; font-size: 1.05rem; }
    .psd-fees, .psd-form, .psd-receipts { padding: 1rem 1.15rem; }
    /* The details form runs down the right; fees, store and receipts stack on the left, with no gaps. */
    .psd:not(.psd--new) > .psd-form { grid-column: 2; grid-row: 1 / span 3; }
    .psd:not(.psd--new) > .psd-fees, .psd:not(.psd--new) > .psd-receipts { grid-column: 1; }
    .psd-package { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap;
      padding: 0.6rem 0.75rem; margin-bottom: 0.9rem; border-radius: 10px; background: #fff7e6; border: 1px solid #ffe0a3; }
    .psd-package small { display: block; color: var(--app-text-muted); font-size: 0.78rem; }
    .psd-in-others { font-size: 0.7rem; color: var(--app-text-muted); margin-top: -0.2rem; }
    .psd-inst { display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem 0.9rem; align-items: end; margin-top: 0.9rem;
      padding: 0.7rem 0.8rem; border-radius: 10px; border: 1px dashed var(--app-border); }
    .psd-inst--on { border-style: solid; border-color: #c4b5fd; background: #faf7ff; }
    .psd-inst-toggle { grid-column: 1 / -1; display: flex; gap: 0.45rem; align-items: center; flex-wrap: wrap; font-weight: 700; font-size: 0.9rem; }
    .psd-inst-toggle small { font-weight: 500; color: var(--app-text-muted); }
    .psd-inst label:not(.psd-inst-toggle) { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.82rem; font-weight: 600; }
    .psd-inst-left small { display: block; font-size: 0.75rem; color: var(--app-text-muted); }
    .psd-receipt-amt { text-align: right; }
    .psd-receipt-amt small { display: block; font-size: 0.75rem; font-weight: 700; }
    .psd-bal { color: #b42318; }
    .psd-paidup { color: #2b7a2b; }
    .psd-parts { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 0.3rem; padding: 0.5rem 0.65rem; border-radius: 8px;
      background: #f8f7fc; font-size: 0.82rem; }
    .psd-parts small { color: var(--app-text-muted); margin-left: 0.3rem; }
    .psd-parts p-button { align-self: flex-start; }
    .psd-next { display: grid; grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr)); gap: 0.5rem; align-items: end; }
    .psd-next label { display: flex; flex-direction: column; gap: 0.2rem; font-weight: 600; font-size: 0.78rem; }
    .psd-next select { padding: 0.5rem; border: 1px solid var(--app-border); border-radius: 6px; background: #fff; font: inherit; }
    .psd-next-btns { display: flex; gap: 0.3rem; grid-column: 1 / -1; }
    .psd-fee-head { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; flex-wrap: wrap; }
    .psd-fee-head small { color: var(--app-text-muted); margin-left: 0.25rem; }
    .psd-warn { margin: 0 0 0.75rem; padding: 0.5rem 0.75rem; border-radius: 8px; background: #fff1d6; color: #7a4a00; }
    .psd-adm { display: flex; gap: 0.75rem; align-items: center; padding: 0.6rem 0.75rem; border-radius: 10px; background: #f5f3ff; margin-bottom: 0.9rem; }
    .psd-adm label { display: flex; gap: 0.4rem; align-items: center; font-weight: 700; }
    .psd-adm input[type='number'] { width: 8rem; }
    .psd-adm--paid { background: #e6f8e6; color: #2b7a2b; font-weight: 700; }
    .psd-label { margin: 0 0 0.4rem; font-weight: 700; font-size: 0.9rem; }
    .psd-months { display: flex; flex-wrap: wrap; gap: 0.45rem; margin-bottom: 1rem; }
    .psd-month { display: inline-flex; flex-direction: column; align-items: center; min-width: 5.5rem; padding: 0.4rem 0.6rem;
      border: 2px solid #e4e6ef; border-radius: 12px; font-weight: 700; font-size: 0.85rem; cursor: pointer; background: #fff; }
    .psd-month input { position: absolute; opacity: 0; pointer-events: none; }
    .psd-month small { font-weight: 500; font-size: 0.7rem; color: var(--app-text-muted); }
    .psd-month--late { border-color: #f5b5b5; }
    .psd-month--late small { color: #b42318; }
    .psd-month--on { border-color: #ff6b8b; background: #fff0f4; }
    .psd-month--paid { background: #e6f8e6; border-color: #bfe6bf; color: #2b7a2b; cursor: default; }
    .psd-pay { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; }
    .psd-wide { grid-column: 1 / -1; }
    .psd-disc { display: grid; grid-template-columns: 1fr 1fr; gap: 0.7rem; margin-top: 0.9rem; padding-top: 0.8rem; border-top: 1px dashed var(--app-border); }
    .psd-disc label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.82rem; font-weight: 600; }
    .psd-sum small { display: block; font-size: 0.78rem; color: var(--app-text-muted); }
    .psd-charges { margin-bottom: 1rem; padding: 0.6rem 0.75rem; border: 1px solid var(--app-border); border-radius: 10px; }
    .psd-charges summary { cursor: pointer; font-weight: 700; font-size: 0.9rem; }
    .psd-charges summary strong { float: right; }
    .psd-part { margin: 0.7rem 0 0.35rem; font-weight: 700; font-size: 0.8rem; color: #4c1d95; }
    .psd-charge-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr)); gap: 0.6rem; }
    .psd-charge-grid label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.8rem; font-weight: 600; }
    .psd-charge span { display: flex; align-items: center; gap: 0.35rem; flex-wrap: wrap; }
    .psd-charge small { font-weight: 500; color: var(--app-text-muted); }
    .psd-charge--on input[type='number'] { border-color: #6d28d9; }
    .psd-pay label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.82rem; font-weight: 600; }
    .psd-modes { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 0.5rem; }
    .psd-modes label { flex-direction: row; align-items: center; gap: 0.35rem; padding: 0.4rem 0.9rem; border: 2px solid #e4e6ef; border-radius: 999px; cursor: pointer; font-size: 0.9rem; }
    .psd-modes .psd-mode--on { border-color: #6d28d9; background: #f5f3ff; }
    .psd-total { display: flex; justify-content: space-between; align-items: center; gap: 1rem; margin-top: 1rem; padding-top: 0.9rem;
      border-top: 1px dashed var(--app-border); font-size: 1.1rem; flex-wrap: wrap; }
    .psd-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; margin-bottom: 1rem; }
    .psd-grid label { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.82rem; font-weight: 600; }
    .psd-grid select { padding: 0.5rem 0.6rem; border: 1px solid var(--app-border); border-radius: 6px; background: #fff; font: inherit; }
    .w2 { grid-column: 1 / -1; }
    .psd-sub { margin: 0.4rem 0 -0.2rem; padding-top: 0.6rem; border-top: 1px dashed var(--app-border); font-weight: 700; font-size: 0.9rem; color: #4c1d95; }
    .psd-sub small { font-weight: 500; color: var(--app-text-muted); }
    .psd-photos { display: flex; gap: 1.1rem; flex-wrap: wrap; }
    .psd-store { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; padding: 0.5rem 0; border-bottom: 1px solid var(--app-border); }
    .psd-store small { display: block; color: var(--app-text-muted); font-size: 0.78rem; }
    .psd-store-ok { color: #2b7a2b; font-weight: 700; font-size: 0.85rem; }
    .psd-title { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
    .psd-receipt { display: grid; grid-template-columns: 1fr auto auto; gap: 0.75rem; align-items: center; padding: 0.55rem 0; border-bottom: 1px solid var(--app-border); }
    .psd-receipt small { display: block; color: var(--app-text-muted); font-size: 0.78rem; }
    .psd-receipt--void { opacity: 0.55; }
    .psd-receipt--void strong { text-decoration: line-through; }
    .psd-receipt-actions { display: flex; align-items: center; }
    .psd-wa { display: grid; place-items: center; width: 2.1rem; height: 2.1rem; border-radius: 50%; color: #1f9d55; text-decoration: none; }
    @media (max-width: 1000px) {
      .psd { grid-template-columns: 1fr; }
      .psd:not(.psd--new) > .psd-form, .psd:not(.psd--new) > .psd-fees, .psd:not(.psd--new) > .psd-receipts { grid-column: 1; grid-row: auto; }
    }
    @media (max-width: 560px) { .psd-inst { grid-template-columns: 1fr; } .psd-receipt { grid-template-columns: 1fr auto; } .psd-receipt-actions { grid-column: 1 / -1; } }
    @media (max-width: 560px) { .psd-grid, .psd-pay { grid-template-columns: 1fr; } }
  `]
})
export class PreSchoolStudentComponent implements OnInit {
  private readonly students = inject(PreSchoolStudentService);
  private readonly storeApi = inject(PreSchoolStoreService);
  private readonly preschool = inject(PreSchoolService);
  private readonly auth = inject(AuthService);
  private readonly messages = inject(MessageService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly modes: PreSchoolPayMode[] = ['Cash', 'UPI', 'Paytm', 'Cheque', 'DD'];
  readonly chargeHeads = PRESCHOOL_CHARGE_HEADS;
  readonly downloading = signal<number | null>(null);
  readonly today = todayIso();
  readonly thisMonth = todayIso().slice(0, 8) + '01';
  readonly money = formatMoney;
  readonly label = monthLabel;

  readonly isNew = signal(true);
  readonly student = signal<PreSchoolStudentDetail | null>(null);
  readonly classes = signal<PreSchoolClass[]>([]);
  readonly picked = signal(new Set<string>());
  readonly saving = signal(false);
  readonly collecting = signal(false);
  readonly isHead = computed(() => this.auth.hasAnyRole(['PreSchoolHead']));
  readonly relations = ['Mother', 'Father', 'Grandmother', 'Grandfather', 'Aunt', 'Uncle', 'Sister', 'Brother', 'Guardian'];

  /** The ID-card photos as on screen, and as last saved, so only changed ones are sent. */
  readonly childPhoto = signal<string | null>(null);
  readonly guardian1Photo = signal<string | null>(null);
  readonly guardian2Photo = signal<string | null>(null);
  private savedPhotos: PreSchoolStudentPhotos = { child: null, guardian1: null, guardian2: null };

  form: PreSchoolStudentSave = blankForm();
  takeAdmission = false;
  admissionAmount: number | null = null;
  payMode: PreSchoolPayMode = 'Cash';
  reference = '';
  receivedOn = todayIso();
  payNote = '';
  chequeDate = todayIso();
  drawnOn = '';
  charges = blankCharges();

  /** The child's class's usual amount for a receipt line, from Classes & Fees. */
  rateOf(head: PreSchoolChargeHead): number {
    const s = this.student();
    const cls = s ? this.classes().find(c => c.id === s.classId) : null;
    return cls?.chargeRates?.[head] ?? 0;
  }

  hasRates(): boolean {
    return PRESCHOOL_CHARGE_HEADS.some(h => this.rateOf(h.head) > 0);
  }

  /** Ticking a line puts in the class's usual amount (if any); unticking clears it. */
  toggleCharge(head: PreSchoolChargeHead): void {
    const c = this.charges[head];
    c.amount = (c.amount ?? 0) > 0 ? null : (this.rateOf(head) || null);
  }

  /** What the receipt's other rows add up to. */
  chargesTotal(): number {
    return PRESCHOOL_CHARGE_HEADS.reduce((t, h) => t + (Number(this.charges[h.head].amount) || 0), 0);
  }

  /** Every month billed so far, plus three ahead for paying in advance. */
  readonly monthChoices = computed<PreSchoolMonth[]>(() => {
    const s = this.student();
    if (!s) return [];
    const months = [...s.months];
    const seen = new Set(months.map(m => m.month));
    let next = months.length ? addMonths(months[months.length - 1].month, 1) : addMonths(this.thisMonth, 0);
    for (let i = 0; i < 3; i++, next = addMonths(next, 1)) {
      if (s.status === 'Active' && !seen.has(next)) months.push({ month: next, isPaid: false, amount: s.monthlyFee });
    }
    return months;
  });

  discountPercent: number | null = null;
  specialOffer: number | null = null;
  offerNote = '';

  /* ------------------------------------------------------ instalments */

  readonly maxInstalments = PRESCHOOL_MAX_INSTALMENTS;
  byInstalments = false;
  paidNow: number | null = null;

  /** Only a receipt with the admission fee or other charges on it may be split; monthly fees alone are paid in full. */
  canSplit(): boolean {
    const s = this.student();
    return !!s && ((this.takeAdmission && !s.admissionPaid) || this.chargesTotal() > 0);
  }

  balanceAfter(): number {
    return Math.max(0, this.total() - (Number(this.paidNow) || 0));
  }

  printsInOthers(head: string): boolean {
    return head in PRESCHOOL_OTHERS_ROW;
  }

  /** The fee chart's whole package for the child's class: admission, the first month and every usual charge. */
  packageTotal(s: PreSchoolStudentDetail): number {
    const firstMonth = this.monthChoices().some(m => !m.isPaid) ? s.monthlyFee : 0;
    return (s.admissionFee || 0) + firstMonth + PRESCHOOL_CHARGE_HEADS.reduce((t, h) => t + this.rateOf(h.head), 0);
  }

  /** Ticks the admission fee, the first unpaid month and every charge the class has a usual amount for. */
  fillPackage(s: PreSchoolStudentDetail): void {
    if (!s.admissionPaid) {
      this.takeAdmission = true;
      this.admissionAmount = s.admissionFee || this.admissionAmount;
    }
    const first = this.monthChoices().find(m => !m.isPaid);
    if (first && s.monthlyFee > 0) this.picked.set(new Set([first.month]));
    for (const h of PRESCHOOL_CHARGE_HEADS) {
      const rate = this.rateOf(h.head);
      if (rate > 0) this.charges[h.head].amount = rate;
    }
  }

  /** The receipt whose next instalment is being entered, and that instalment. */
  readonly instalmentFor = signal<number | null>(null);
  readonly savingInstalment = signal(false);
  next = { amount: null as number | null, paidOn: todayIso(), mode: 'Cash' as PreSchoolPayMode, reference: '' };

  startInstalment(r: PreSchoolReceiptSummary): void {
    this.next = { amount: r.balance ?? null, paidOn: todayIso(), mode: 'Cash', reference: '' };
    this.instalmentFor.set(r.id);
  }

  saveInstalment(r: PreSchoolReceiptSummary): void {
    const amount = Number(this.next.amount) || 0;
    if (amount <= 0) return this.warn('Enter the amount received.');
    if (amount > (r.balance ?? 0)) return this.warn(`Only ${this.money(r.balance ?? 0)} is left to pay on ${r.receiptCode}.`);
    const isLast = (r.payments?.length ?? 1) + 1 >= PRESCHOOL_MAX_INSTALMENTS;
    if (isLast && amount < (r.balance ?? 0)) return this.warn(`This is the last instalment allowed: it must clear the ${this.money(r.balance ?? 0)} left.`);
    if (this.next.mode !== 'Cash' && !this.next.reference.trim()) return this.warn(`Enter the ${this.next.mode} reference / number.`);

    this.savingInstalment.set(true);
    this.students.addPayment(r.id, {
      amount, paidOn: this.next.paidOn || null, mode: this.next.mode,
      reference: this.next.mode === 'Cash' ? null : this.next.reference.trim(), notes: null
    }).subscribe({
      next: receipt => {
        this.savingInstalment.set(false);
        this.instalmentFor.set(null);
        this.done(`Instalment received · ${this.money(amount)} · balance ${this.money(receipt.balance ?? 0)}`);
        const s = this.student();
        if (s) this.load(s.id);
      },
      error: () => this.savingInstalment.set(false)
    });
  }

  /** Before any discount. A method, not a computed: the admission tick and amount are plain form fields. */
  gross(): number {
    const s = this.student();
    if (!s) return 0;
    const admission = this.takeAdmission && !s.admissionPaid ? Number(this.admissionAmount) || 0 : 0;
    return admission + this.picked().size * s.monthlyFee + this.chargesTotal();
  }

  /** The percentage off the whole receipt, rounded to the paisa as the server does. */
  discountAmount(): number {
    const pct = Math.min(100, Math.max(0, Number(this.discountPercent) || 0));
    return Math.round(this.gross() * pct) / 100;
  }

  offerAmount(): number {
    return Math.max(0, Number(this.specialOffer) || 0);
  }

  /** What is actually collected: fees less the discount, less the special offer. */
  total(): number {
    return Math.max(0, this.gross() - this.discountAmount() - this.offerAmount());
  }

  ngOnInit(): void {
    this.preschool.overview().subscribe(o => this.classes.set(o.classes));
    const id = Number(this.route.snapshot.paramMap.get('id'));
    if (id) {
      this.isNew.set(false);
      this.load(id);
      this.loadPhotos(id);
    }
  }

  readonly storeLines = signal<PreSchoolStudentStoreLine[]>([]);
  readonly giving = signal<number | null>(null);

  private loadStore(id: number): void {
    this.storeApi.forStudent(id).subscribe(l => this.storeLines.set(l));
  }

  /** Gives the child one of the item; it comes off the class's stock. */
  give(s: PreSchoolStudentDetail, itemId: number, name: string): void {
    this.giving.set(itemId);
    this.storeApi.give(s.id, itemId).subscribe({
      next: l => { this.giving.set(null); this.storeLines.set(l); this.done(`${name} given to ${s.childName}`); },
      error: () => this.giving.set(null)
    });
  }

  private loadPhotos(id: number): void {
    this.students.photos(id).subscribe(p => this.showPhotos(p));
  }

  private showPhotos(p: PreSchoolStudentPhotos): void {
    this.savedPhotos = p;
    this.childPhoto.set(p.child);
    this.guardian1Photo.set(p.guardian1);
    this.guardian2Photo.set(p.guardian2);
  }

  /** Sends each photo that differs from what was last saved, one after another. */
  private savePhotos(id: number): Observable<PreSchoolStudentPhotos> {
    const changes: [PreSchoolPhotoSlot, string | null][] = [];
    if (this.childPhoto() !== this.savedPhotos.child) changes.push(['Child', this.childPhoto()]);
    if (this.guardian1Photo() !== this.savedPhotos.guardian1) changes.push(['Guardian1', this.guardian1Photo()]);
    if (this.guardian2Photo() !== this.savedPhotos.guardian2) changes.push(['Guardian2', this.guardian2Photo()]);
    if (changes.length === 0) return of(this.savedPhotos);
    return from(changes).pipe(concatMap(([slot, url]) => this.students.savePhoto(id, slot, url)), last());
  }


  private load(id: number): void {
    this.loadStore(id);
    this.students.get(id).subscribe(s => {
      this.student.set(s);
      const { id: _id, admissionCode: _a, className: _c, monthlyFee: _m, admissionFee: _f, admissionPaid: _p, months: _ms, receipts: _r, ...editable } = s;
      this.form = { ...blankForm(), ...editable };
      this.takeAdmission = !s.admissionPaid && s.admissionFee > 0;
      this.admissionAmount = s.admissionFee || null;
      this.picked.set(new Set());
    });
  }

  toggle(month: string): void {
    const next = new Set(this.picked());
    if (next.has(month)) next.delete(month); else next.add(month);
    this.picked.set(next);
  }

  save(): void {
    const f = this.form;
    if (!f.childName.trim()) return this.warn('Enter the child\'s name.');
    if (!f.dateOfBirth) return this.warn('Enter the date of birth.');
    if (!f.classId) return this.warn('Pick a class.');
    if (!f.joinedOn) return this.warn('Pick the joining date.');
    if (!f.parentName.trim()) return this.warn('Enter the parent to contact.');
    if (!/^\+?[0-9 \-]{10,15}$/.test(f.phone.trim())) return this.warn('Enter a 10-digit phone number.');
    if (!f.address?.trim()) return this.warn('Enter the home address.');
    if (f.status !== 'Active' && !f.endedOn) return this.warn('Give the date the child completed the class or left.');
    if (f.guardian2Phone?.trim() && !/^\+?[0-9 \-]{10,15}$/.test(f.guardian2Phone.trim())) return this.warn('Enter a 10-digit phone for guardian 2.');
    if (f.guardian2Phone?.trim() && !f.guardian2Name?.trim()) return this.warn('Enter guardian 2\'s name with their phone.');

    const clean = (v: string | null) => (v ?? '').trim() || null;
    const measure = (v: number | string | null) => (v === null || v === '' ? null : Number(v) || null);
    const body: PreSchoolStudentSave = {
      ...f, childName: f.childName.trim(), parentName: f.parentName.trim(), phone: f.phone.trim(),
      gender: f.gender || null, bloodGroup: clean(f.bloodGroup), fatherName: clean(f.fatherName), motherName: clean(f.motherName),
      emergencyPhone: clean(f.emergencyPhone), email: clean(f.email), address: clean(f.address), notes: clean(f.notes),
      guardianRelation: clean(f.guardianRelation), guardian2Name: clean(f.guardian2Name),
      guardian2Relation: clean(f.guardian2Relation), guardian2Phone: clean(f.guardian2Phone),
      heightCm: measure(f.heightCm), weightKg: measure(f.weightKg),
      monthlyDiscount: Number(f.monthlyDiscount) || 0, endedOn: f.status === 'Active' ? null : f.endedOn || null
    };

    this.saving.set(true);
    const existing = this.student();
    this.students.save(existing?.id ?? null, body).subscribe({
      next: saved => {
        // The details are saved; the photos follow. A photo that fails leaves
        // the admission in place, and can be taken again on the child's page.
        this.savePhotos(saved.id).subscribe({
          next: photos => this.afterSave(saved, photos, !existing),
          error: () => {
            this.warn('The details were saved, but a photo was not. Take it again and save.');
            this.afterSave(saved, null, !existing);
          }
        });
      },
      error: () => this.saving.set(false)
    });
  }

  private afterSave(saved: PreSchoolStudentDetail, photos: PreSchoolStudentPhotos | null, isAdmission: boolean): void {
    this.saving.set(false);
    if (photos) this.showPhotos(photos);
    if (!isAdmission) {
      this.done('Details saved');
      this.load(saved.id);
      return;
    }

    this.done(`Admission saved · ${saved.admissionCode}`);
    void this.router.navigate(['/preschool/students', saved.id]).then(() => {
      this.isNew.set(false);
      this.load(saved.id);
      if (!photos) this.loadPhotos(saved.id);
    });
  }

  collect(s: PreSchoolStudentDetail): void {
    const byCheque = this.payMode === 'Cheque' || this.payMode === 'DD';
    if (this.payMode !== 'Cash' && !this.reference.trim()) {
      return this.warn(byCheque ? `Enter the ${this.payMode} number.` : `Enter the ${this.payMode} reference number.`);
    }
    if (byCheque && !this.chequeDate) return this.warn(`Enter the ${this.payMode} date.`);
    if (byCheque && !this.drawnOn.trim()) return this.warn(`Enter the bank the ${this.payMode} is drawn on.`);
    if (PRESCHOOL_CHARGE_HEADS.some(h => (Number(this.charges[h.head].amount) || 0) < 0)) return this.warn('A charge cannot be negative.');
    const pct = Number(this.discountPercent) || 0;
    if (pct < 0 || pct > 100) return this.warn('The discount is a percentage from 0 to 100.');
    if (this.offerAmount() > this.gross() - this.discountAmount()) return this.warn('The special offer is more than what is left to pay.');
    if (this.takeAdmission && !s.admissionPaid && !(Number(this.admissionAmount) > 0)) return this.warn('Enter the admission amount.');
    const split = this.byInstalments && this.canSplit();
    const firstPart = Number(this.paidNow) || 0;
    if (split && (firstPart <= 0 || firstPart >= this.total())) {
      return this.warn(`Enter the 1st instalment: more than 0 and less than the total ${this.money(this.total())}.`);
    }

    // Opened now, while the click still counts as the user's, so the pop-up blocker lets it through.
    // In the app there is no window: the parent copy is saved as a PDF instead, once collected.
    const win = isNativeApp() ? null : openPendingDocumentWindow(1180, 900);
    this.collecting.set(true);
    this.students.collect(s.id, {
      includeAdmission: this.takeAdmission && !s.admissionPaid,
      admissionAmount: this.takeAdmission ? Number(this.admissionAmount) || null : null,
      months: [...this.picked()].sort(),
      mode: this.payMode,
      charges: PRESCHOOL_CHARGE_HEADS
        .filter(h => (Number(this.charges[h.head].amount) || 0) > 0)
        .map(h => ({ head: h.head, amount: Number(this.charges[h.head].amount), note: this.charges[h.head].note.trim() || null })),
      reference: this.payMode === 'Cash' ? null : this.reference.trim(),
      chequeDate: byCheque ? this.chequeDate : null,
      drawnOn: byCheque ? this.drawnOn.trim() : null,
      discountPercent: pct > 0 ? pct : null,
      specialOffer: this.offerAmount() > 0 ? this.offerAmount() : null,
      offerNote: this.offerAmount() > 0 ? this.offerNote.trim() || null : null,
      receivedOn: this.receivedOn || null,
      notes: this.payNote.trim() || null,
      paidNow: split ? firstPart : null
    }).subscribe({
      next: receipt => {
        this.collecting.set(false);
        if (isNativeApp()) {
          void downloadSizedPdf(feeReceiptHtml(receipt, 'parent'), pdfFileName('FeeReceipt', receipt.receiptCode, receipt.childName),
            { width: 559, format: 'a5' }).catch(() => undefined);
        } else {
          this.show(win, receipt);
        }
        this.done((receipt.balance ?? 0) > 0
          ? `Received ${this.money(receipt.paid ?? 0)} of ${this.money(receipt.total)} · balance ${this.money(receipt.balance ?? 0)} · ${receipt.receiptCode}`
          : `Received ${this.money(receipt.total)} · ${receipt.receiptCode}`);
        this.byInstalments = false;
        this.paidNow = null;
        this.reference = '';
        this.payNote = '';
        this.drawnOn = '';
        this.discountPercent = null;
        this.specialOffer = null;
        this.offerNote = '';
        this.charges = blankCharges();
        this.load(s.id);
      },
      error: () => { this.collecting.set(false); win?.close(); }
    });
  }

  /** Both copies on one A4 sheet, side by side: the parent's half and the office's half. */
  print(receiptId: number): void {
    if (isNativeApp()) {
      // No print window in the app: both copies on one landscape A4 page, as a PDF to print from the phone.
      this.students.receipt(receiptId).subscribe(r =>
        downloadSizedPdf(feeReceiptHtml(r, 'pair'), pdfFileName('FeeReceipt', r.receiptCode, 'both-copies'),
          { width: 1123, format: 'a4', landscape: true })
          .catch(() => this.warn('The PDF could not be made. Please try again.')));
      return;
    }
    const win = openPendingDocumentWindow(1180, 900);
    this.students.receipt(receiptId).subscribe({ next: r => this.show(win, r), error: () => win?.close() });
  }

  /** The parent copy alone, as a half-A4 (A5) PDF to send or print. */
  downloadParentCopy(receiptId: number): void {
    this.downloading.set(receiptId);
    this.students.receipt(receiptId).subscribe({
      next: r => {
        downloadSizedPdf(feeReceiptHtml(r, 'parent'), pdfFileName('FeeReceipt', r.receiptCode, r.childName), { width: 559, format: 'a5' })
          .catch(() => this.warn('The PDF could not be made. Try again, or use Print and save as PDF.'))
          .finally(() => this.downloading.set(null));
      },
      error: () => this.downloading.set(null)
    });
  }

  cancel(receiptId: number, code: string): void {
    if (!confirm(`Cancel receipt ${code}? Its months will be due again. This cannot be undone.`)) return;
    this.students.cancelReceipt(receiptId).subscribe(() => {
      this.done(`${code} cancelled`);
      const s = this.student();
      if (s) this.load(s.id);
    });
  }

  share(s: PreSchoolStudentDetail, code: string, total: number, summary: string): string {
    return whatsAppLink(s.phone,
      `Avijan PreSchool: received ${this.money(total)} for ${s.childName} (${summary}). Receipt ${code}. Thank you.`);
  }

  private show(win: Window | null, receipt: PreSchoolReceipt): void {
    if (!writeDocumentWindow(win, feeReceiptHtml(receipt, 'pair'))) {
      this.warn('The receipt window was blocked. Allow pop-ups for this site, then use the print button under Receipts.');
    }
  }

  private done(summary: string): void {
    this.messages.add({ severity: 'success', summary, life: 3000 });
  }

  private warn(detail: string): void {
    this.messages.add({ severity: 'warn', summary: 'Please check', detail, life: 4500 });
  }
}
