import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { PreSchoolEnquirySave } from '../../core/models/preschool.model';
import { ENQUIRY_CLASSES, ENQUIRY_SOURCES, currentSession } from '../../core/printing/preschool-forms';

const PHONE = /^[0-9]{10}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Avijan PreSchool's Enquiry Form on screen, laid out like the printed sheet:
 * the school's header, the child, the class wanted, mother, father, guardian,
 * and where the family heard of the school. Used by the public page, the app
 * and the office (for a walk-in). It checks the form and hands it back
 * cleaned; the page decides where to send it.
 */
@Component({
  selector: 'app-preschool-enquiry-form',
  standalone: true,
  imports: [FormsModule],
  template: `
    <form class="ef" (ngSubmit)="submit()" novalidate>
      <img class="ef__head" src="images/preschool/enquiry-header.png"
        alt="Avijan Preschool, powered by My Chhota School — Enquiry Form" />

      <div class="ef__row">
        <label class="ef__f ef__grow"><span>Name of the Child: <span class="ef__req" aria-hidden="true">*</span></span>
          <input name="child" [(ngModel)]="form.childName" maxlength="100" required autocomplete="off" /></label>
        <label class="ef__f">Session:
          <select name="session" [(ngModel)]="form.session">
            @for (s of sessions; track s) { <option [ngValue]="s">{{ s }}</option> }
          </select></label>
      </div>

      <div class="ef__row">
        <fieldset class="ef__checks">
          <legend>Gender :</legend>
          @for (g of genders; track g) {
            <label class="ef__chk"><input type="radio" name="gender" [value]="g" [(ngModel)]="form.gender" /><span></span>{{ g }}</label>
          }
        </fieldset>
        <label class="ef__f">Date Of Birth: <input name="dob" type="date" [(ngModel)]="form.childDateOfBirth" [max]="today" /></label>
      </div>

      <fieldset class="ef__checks ef__block">
        <legend>Admission Sought in:</legend>
        @for (c of classes; track c) {
          <label class="ef__chk"><input type="radio" name="class" [value]="c" [(ngModel)]="form.classWanted" /><span></span>{{ c }}</label>
        }
      </fieldset>

      @for (p of people; track p.key) {
        <div class="ef__person">
          <label class="ef__f ef__half">{{ p.title }}
            <input [name]="p.key + 'Name'" [(ngModel)]="form[p.name]" maxlength="100" autocomplete="off" /></label>
          <div class="ef__row">
            <label class="ef__f ef__occ">Occupation: <input [name]="p.key + 'Occ'" [(ngModel)]="form[p.occupation]" maxlength="60" /></label>
            <label class="ef__f">Contact No.:
              <input class="ef__cells" [name]="p.key + 'Phone'" [(ngModel)]="form[p.phone]" maxlength="10" inputmode="numeric"
                pattern="[0-9]*" autocomplete="tel" (input)="digitsOnly($event, p.phone)" /></label>
          </div>
          @if (p.email) {
            <label class="ef__f">Email Id: <input type="email" [name]="p.key + 'Email'" [(ngModel)]="form[p.email]" maxlength="150" /></label>
          }
          <label class="ef__f">Address For Communication:
            <textarea [name]="p.key + 'Addr'" rows="2" [(ngModel)]="form[p.address]" maxlength="400"></textarea></label>
        </div>
      }

      <fieldset class="ef__checks ef__block">
        <legend>Where did you get to know about “ School ”</legend>
        @for (s of sources; track s) {
          <label class="ef__chk ef__chk--box"><input type="checkbox" [checked]="form.heardFrom.includes(s)" (change)="toggleSource(s)" /><span></span>{{ s }}</label>
        }
      </fieldset>

      @if (error) { <p class="ef__error" role="alert">{{ error }}</p> }
      <p class="ef__hint">* Child's name, and a name with a 10-digit contact number for the mother, father or guardian.</p>
      <button type="submit" class="ef__send" [disabled]="busy">{{ busy ? 'Please wait…' : submitLabel }}</button>
    </form>
  `,
  styles: [`
    :host { display: block; }
    .ef { --ink: #2c3e50; display: flex; flex-direction: column; gap: 1rem; padding: 1.1rem 1.25rem 1.4rem;
      border: 8px solid #00aeef; background: #fff; color: var(--ink); font-family: Arial, Helvetica, sans-serif; }
    .ef__head { width: 100%; max-width: 640px; align-self: center; height: auto; }
    .ef__row { display: flex; flex-wrap: wrap; gap: 0.8rem 1.4rem; align-items: flex-end; }
    .ef__f { display: flex; flex-direction: column; gap: 0.3rem; font-weight: 700; font-size: 1rem; }
    .ef__grow { flex: 1 1 16rem; }
    .ef__half { max-width: 26rem; }
    .ef__occ { flex: 0 1 14rem; }
    .ef__req { color: #c0392b; }
    .ef input:not([type=radio]):not([type=checkbox]), .ef select, .ef textarea {
      font: 400 1rem Arial, Helvetica, sans-serif; color: #111; padding: 0.45rem 0.55rem; border: 1px solid var(--ink);
      border-radius: 0; background: #fff; min-height: 2.1rem; box-sizing: border-box; width: 100%; }
    .ef textarea { resize: vertical; }
    .ef input:focus, .ef select:focus, .ef textarea:focus { outline: 2px solid #00aeef; outline-offset: 1px; }
    /* Ten boxes, one digit in each, as on the paper form. */
    .ef .ef__cells { width: 281px !important; max-width: 100%; padding: 0 0 0 9px !important; letter-spacing: 18.5px;
      font: 400 16px 'Courier New', Courier, monospace !important;
      background: repeating-linear-gradient(90deg, transparent 0 27.1px, var(--ink) 27.1px 28.1px) !important; }
    .ef__checks { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem 1.4rem; border: 0; margin: 0; padding: 0; }
    .ef__checks legend { float: left; margin-right: 0.6rem; font-weight: 700; font-size: 1rem; }
    .ef__block legend { float: none; width: 100%; margin-bottom: 0.6rem; }
    .ef__chk { display: inline-flex; align-items: center; gap: 0.5rem; font-weight: 700; cursor: pointer; min-height: 44px; }
    .ef__chk input { position: absolute; opacity: 0; width: 1px; height: 1px; }
    .ef__chk span { width: 28px; height: 28px; border: 1px solid var(--ink); display: grid; place-items: center; background: #fff; }
    .ef__chk input:checked + span::after { content: '✓'; font: 700 20px Arial, sans-serif; color: #111; }
    .ef__chk input:focus-visible + span { outline: 2px solid #00aeef; outline-offset: 2px; }
    .ef__chk--box { flex-direction: row-reverse; font-size: 0.95rem; }
    .ef__person { display: flex; flex-direction: column; gap: 0.75rem; padding-top: 0.9rem; border-top: 1px dashed #b9c6d3; }
    .ef__error { margin: 0; color: #b42318; font-weight: 700; }
    .ef__hint { margin: 0; font-size: 0.85rem; color: #5b6178; }
    .ef__send { align-self: flex-start; min-height: 44px; padding: 0.7rem 1.8rem; border: 0; border-radius: 999px;
      background: #00aeef; color: #fff; font: 700 1rem Arial, sans-serif; cursor: pointer; }
    .ef__send:disabled { opacity: 0.6; cursor: wait; }
    @media (max-width: 560px) { .ef { padding: 0.9rem 0.8rem 1.2rem; border-width: 6px; } .ef__occ { flex-basis: 100%; } }
  `]
})
export class PreSchoolEnquiryFormComponent {
  /** The form to fill in; edited in place. */
  @Input({ required: true }) form!: PreSchoolEnquirySave;
  @Input() busy = false;
  @Input() submitLabel = 'Send enquiry';
  @Output() readonly submitted = new EventEmitter<PreSchoolEnquirySave>();

  readonly classes = ENQUIRY_CLASSES;
  readonly sources = ENQUIRY_SOURCES;
  readonly genders = ['Female', 'Male'] as const;
  readonly today = new Date().toISOString().slice(0, 10);
  readonly sessions = (() => {
    const y = new Date().getFullYear();
    return [y - 1, y, y + 1].map(s => currentSession(new Date(s, 5, 1)));
  })();

  readonly people = [
    { key: 'mother', title: 'Mother’s Name:', name: 'motherName', occupation: 'motherOccupation', phone: 'motherPhone', email: 'motherEmail', address: 'motherAddress' },
    { key: 'father', title: 'Father’s Name:', name: 'fatherName', occupation: 'fatherOccupation', phone: 'fatherPhone', email: 'fatherEmail', address: 'fatherAddress' },
    { key: 'guardian', title: 'Guardian Name:', name: 'guardianName', occupation: 'guardianOccupation', phone: 'guardianPhone', email: null, address: 'guardianAddress' }
  ] as const;

  error: string | null = null;

  /** Keeps the contact boxes to digits, so each sits in its own box. */
  digitsOnly(event: Event, field: 'motherPhone' | 'fatherPhone' | 'guardianPhone'): void {
    const input = event.target as HTMLInputElement;
    const clean = input.value.replace(/\D/g, '').slice(0, 10);
    if (clean !== input.value) input.value = clean;
    this.form[field] = clean || null;
  }

  toggleSource(s: string): void {
    const list = this.form.heardFrom;
    this.form.heardFrom = list.includes(s) ? list.filter(x => x !== s) : [...list, s];
  }

  submit(): void {
    const f = this.form;
    const t = (v: string | null | undefined) => (v ?? '').trim() || null;
    if (!f.childName.trim()) return this.fail("Please enter the child's name.");

    for (const p of this.people) {
      const phone = t(f[p.phone]);
      if (phone && !PHONE.test(phone)) return this.fail(`Enter a 10-digit contact number for the ${p.key}.`);
      if (phone && !t(f[p.name])) return this.fail(`Enter the ${p.key}'s name with their contact number.`);
      const email = p.email ? t(f[p.email]) : null;
      if (email && !EMAIL.test(email)) return this.fail(`Check the ${p.key}'s email address.`);
    }
    if (!this.people.some(p => t(f[p.name]) && t(f[p.phone]))) {
      return this.fail("Enter the mother's, father's or guardian's name with a contact number.");
    }

    this.error = null;
    this.submitted.emit({
      ...f,
      childName: f.childName.trim(),
      childDateOfBirth: f.childDateOfBirth || null,
      motherName: t(f.motherName), motherOccupation: t(f.motherOccupation), motherPhone: t(f.motherPhone),
      motherEmail: t(f.motherEmail), motherAddress: t(f.motherAddress),
      fatherName: t(f.fatherName), fatherOccupation: t(f.fatherOccupation), fatherPhone: t(f.fatherPhone),
      fatherEmail: t(f.fatherEmail), fatherAddress: t(f.fatherAddress),
      guardianName: t(f.guardianName), guardianOccupation: t(f.guardianOccupation), guardianPhone: t(f.guardianPhone),
      guardianAddress: t(f.guardianAddress)
    });
  }

  private fail(message: string): void {
    this.error = message;
  }
}
