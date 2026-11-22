import { Component, ElementRef, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { PreSchoolEnquirySave } from '../../core/models/preschool.model';
import { ENQUIRY_CLASSES, ENQUIRY_SOURCES, currentSession } from '../../core/printing/preschool-forms';

const PHONE = /^[0-9]{10}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Avijan PreSchool's Enquiry Form on screen, laid out like the printed sheet:
 * the school's header, the child, the class wanted, mother, father, guardian,
 * and where the family heard of the school. Used by the public page, the app
 * and the office (for a walk-in).
 *
 * Required (marked *): the child's name, session, gender, date of birth and
 * class; at least one of mother, father or guardian with name, 10-digit
 * contact number and address; and where the family heard of the school.
 * Anyone else whose details are started must have a name and a valid number.
 * Each problem is shown under its own field, and the first one is scrolled to.
 */
@Component({
  selector: 'app-preschool-enquiry-form',
  standalone: true,
  imports: [FormsModule],
  template: `
    <form class="ef" (ngSubmit)="submit()" novalidate>
      <img class="ef__head" src="images/preschool/enquiry-header.png"
        alt="Avijan Preschool, powered by My Chhota School — Enquiry Form" />

      <p class="ef__intro">Fields marked <span class="ef__req">*</span> are required.</p>

      <section class="ef__sec">
        <h3 class="ef__sec-title">Child</h3>
        <div class="ef__grid">
          <label class="ef__f ef__span2" [class.ef__bad]="errors['child']">
            <span>Name of the Child <span class="ef__req">*</span></span>
            <input name="child" [(ngModel)]="form.childName" maxlength="100" autocomplete="off" [attr.aria-invalid]="!!errors['child']" />
            @if (errors['child']) { <small class="ef__msg">{{ errors['child'] }}</small> }
          </label>
          <label class="ef__f" [class.ef__bad]="errors['session']">
            <span>Session <span class="ef__req">*</span></span>
            <select name="session" [(ngModel)]="form.session">
              <option [ngValue]="null" disabled>Select</option>
              @for (s of sessions; track s) { <option [ngValue]="s">{{ s }}</option> }
            </select>
            @if (errors['session']) { <small class="ef__msg">{{ errors['session'] }}</small> }
          </label>
          <label class="ef__f" [class.ef__bad]="errors['dob']">
            <span>Date of Birth <span class="ef__req">*</span></span>
            <input name="dob" type="date" [(ngModel)]="form.childDateOfBirth" [max]="today" [attr.aria-invalid]="!!errors['dob']" />
            @if (errors['dob']) { <small class="ef__msg">{{ errors['dob'] }}</small> }
          </label>
          <fieldset class="ef__checks ef__span2" [class.ef__bad]="errors['gender']">
            <legend>Gender <span class="ef__req">*</span></legend>
            @for (g of genders; track g) {
              <label class="ef__chk"><input type="radio" name="gender" [value]="g" [(ngModel)]="form.gender" /><span></span>{{ g }}</label>
            }
            @if (errors['gender']) { <small class="ef__msg ef__msg--block">{{ errors['gender'] }}</small> }
          </fieldset>
        </div>

        <fieldset class="ef__checks ef__block" [class.ef__bad]="errors['class']">
          <legend>Admission Sought in <span class="ef__req">*</span></legend>
          @for (c of classes; track c) {
            <label class="ef__chk"><input type="radio" name="class" [value]="c" [(ngModel)]="form.classWanted" /><span></span>{{ c }}</label>
          }
          @if (errors['class']) { <small class="ef__msg ef__msg--block">{{ errors['class'] }}</small> }
        </fieldset>
      </section>

      <p class="ef__note" [class.ef__note--bad]="errors['contact']">
        <span class="ef__req">*</span> Fill in at least one of Mother, Father or Guardian with name, contact number and address.
        @if (errors['contact']) { <strong> {{ errors['contact'] }}</strong> }
      </p>

      @for (p of people; track p.key) {
        <section class="ef__sec ef__person">
          <h3 class="ef__sec-title">{{ p.heading }}</h3>
          <div class="ef__grid">
            <label class="ef__f ef__span2" [class.ef__bad]="errors[p.key + 'Name']">
              <span>{{ p.title }}</span>
              <input [name]="p.key + 'Name'" [(ngModel)]="form[p.name]" maxlength="100" autocomplete="off" />
              @if (errors[p.key + 'Name']) { <small class="ef__msg">{{ errors[p.key + 'Name'] }}</small> }
            </label>
            <label class="ef__f">
              <span>Occupation</span>
              <input [name]="p.key + 'Occ'" [(ngModel)]="form[p.occupation]" maxlength="60" />
            </label>
            <label class="ef__f" [class.ef__bad]="errors[p.key + 'Phone']">
              <span>Contact No.</span>
              <input class="ef__cells" [name]="p.key + 'Phone'" [(ngModel)]="form[p.phone]" maxlength="10" inputmode="numeric"
                pattern="[0-9]*" autocomplete="tel" (input)="digitsOnly($event, p.phone)" />
              @if (errors[p.key + 'Phone']) { <small class="ef__msg">{{ errors[p.key + 'Phone'] }}</small> }
            </label>
            @if (p.email) {
              <label class="ef__f ef__span2" [class.ef__bad]="errors[p.key + 'Email']">
                <span>Email Id</span>
                <input type="email" [name]="p.key + 'Email'" [(ngModel)]="form[p.email]" maxlength="150" />
                @if (errors[p.key + 'Email']) { <small class="ef__msg">{{ errors[p.key + 'Email'] }}</small> }
              </label>
            }
            <label class="ef__f ef__span2" [class.ef__bad]="errors[p.key + 'Address']">
              <span>Address For Communication</span>
              <textarea [name]="p.key + 'Addr'" rows="2" [(ngModel)]="form[p.address]" maxlength="400"></textarea>
              @if (errors[p.key + 'Address']) { <small class="ef__msg">{{ errors[p.key + 'Address'] }}</small> }
            </label>
          </div>
        </section>
      }

      <fieldset class="ef__checks ef__block ef__sec" [class.ef__bad]="errors['heard']">
        <legend>Where did you get to know about “ School ” <span class="ef__req">*</span></legend>
        @for (s of sources; track s) {
          <label class="ef__chk ef__chk--box"><input type="checkbox" [checked]="form.heardFrom.includes(s)" (change)="toggleSource(s)" /><span></span>{{ s }}</label>
        }
        @if (errors['heard']) { <small class="ef__msg ef__msg--block">{{ errors['heard'] }}</small> }
      </fieldset>

      @if (errorCount) {
        <p class="ef__error" role="alert">Please complete {{ errorCount === 1 ? 'the highlighted field' : 'the ' + errorCount + ' highlighted fields' }}.</p>
      }
      <button type="submit" class="ef__send" [disabled]="busy">{{ busy ? 'Please wait…' : submitLabel }}</button>
    </form>
  `,
  styles: [`
    :host { display: block; }
    .ef { --ink: #2c3e50; --bad: #c0392b; display: flex; flex-direction: column; gap: 1.1rem; padding: 1.1rem 1.25rem 1.4rem;
      border: 8px solid #00aeef; background: #fff; color: var(--ink); font-family: Arial, Helvetica, sans-serif; }
    .ef__head { width: 100%; max-width: 640px; align-self: center; height: auto; }
    .ef__intro { margin: -0.4rem 0 0; font-size: 0.85rem; color: #5b6178; text-align: center; }
    .ef__sec { display: flex; flex-direction: column; gap: 0.85rem; }
    .ef__sec-title { margin: 0; font-size: 0.8rem; letter-spacing: 0.08em; text-transform: uppercase; color: #0089bd; }
    .ef__person { padding-top: 1rem; border-top: 1px dashed #b9c6d3; }
    .ef__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.85rem 1.2rem; }
    .ef__span2 { grid-column: 1 / -1; }
    .ef__f { display: flex; flex-direction: column; gap: 0.3rem; font-weight: 700; font-size: 0.95rem; min-width: 0; }
    .ef__req { color: var(--bad); }
    .ef input:not([type=radio]):not([type=checkbox]), .ef select, .ef textarea {
      font: 400 1rem Arial, Helvetica, sans-serif; color: #111; padding: 0.5rem 0.6rem; border: 1px solid var(--ink);
      border-radius: 0; background: #fff; min-height: 2.5rem; box-sizing: border-box; width: 100%; }
    .ef textarea { resize: vertical; }
    .ef input:focus, .ef select:focus, .ef textarea:focus { outline: 2px solid #00aeef; outline-offset: 1px; }
    .ef .ef__bad input:not([type=radio]):not([type=checkbox]), .ef .ef__bad select, .ef .ef__bad textarea {
      border-color: var(--bad); box-shadow: 0 0 0 1px var(--bad); }
    .ef .ef__bad .ef__chk span { border-color: var(--bad); }
    .ef__msg { color: var(--bad); font-weight: 600; font-size: 0.8rem; }
    .ef__msg--block { flex-basis: 100%; }
    /* Ten boxes, one digit in each, as on the paper form. */
    .ef .ef__cells { width: 281px !important; max-width: 100%; padding: 0 0 0 9px !important; letter-spacing: 18.5px;
      font: 400 16px 'Courier New', Courier, monospace !important;
      background: repeating-linear-gradient(90deg, transparent 0 27.1px, var(--ink) 27.1px 28.1px) !important; }
    .ef__checks { display: flex; flex-wrap: wrap; align-items: center; gap: 0.3rem 1.4rem; border: 0; margin: 0; padding: 0; min-width: 0; }
    .ef__checks legend { padding: 0; margin-bottom: 0.35rem; font-weight: 700; font-size: 0.95rem; }
    .ef__chk { display: inline-flex; align-items: center; gap: 0.5rem; font-weight: 700; cursor: pointer; min-height: 44px; }
    .ef__chk input { position: absolute; opacity: 0; width: 1px; height: 1px; }
    .ef__chk span { width: 28px; height: 28px; border: 1px solid var(--ink); display: grid; place-items: center; background: #fff; flex: 0 0 auto; }
    .ef__chk input:checked + span::after { content: '✓'; font: 700 20px Arial, sans-serif; color: #111; }
    .ef__chk input:focus-visible + span { outline: 2px solid #00aeef; outline-offset: 2px; }
    .ef__chk--box { flex-direction: row-reverse; font-size: 0.95rem; }
    .ef__note { margin: 0; padding: 0.6rem 0.8rem; background: #eef9fe; border-left: 4px solid #00aeef; font-size: 0.88rem; }
    .ef__note--bad { background: #fdf0ee; border-left-color: var(--bad); }
    .ef__note strong { color: var(--bad); }
    .ef__error { margin: 0; color: var(--bad); font-weight: 700; }
    .ef__send { align-self: flex-start; min-height: 44px; padding: 0.7rem 1.8rem; border: 0; border-radius: 999px;
      background: #00aeef; color: #fff; font: 700 1rem Arial, sans-serif; cursor: pointer; }
    .ef__send:disabled { opacity: 0.6; cursor: wait; }
    @media (max-width: 560px) {
      .ef { padding: 0.9rem 0.8rem 1.2rem; border-width: 6px; }
      .ef__grid { grid-template-columns: minmax(0, 1fr); }
      .ef__send { align-self: stretch; }
    }
  `]
})
export class PreSchoolEnquiryFormComponent {
  private readonly host = inject(ElementRef<HTMLElement>);

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
    { key: 'mother', heading: 'Mother', title: 'Mother’s Name', name: 'motherName', occupation: 'motherOccupation', phone: 'motherPhone', email: 'motherEmail', address: 'motherAddress' },
    { key: 'father', heading: 'Father', title: 'Father’s Name', name: 'fatherName', occupation: 'fatherOccupation', phone: 'fatherPhone', email: 'fatherEmail', address: 'fatherAddress' },
    { key: 'guardian', heading: 'Guardian', title: 'Guardian Name', name: 'guardianName', occupation: 'guardianOccupation', phone: 'guardianPhone', email: null, address: 'guardianAddress' }
  ] as const;

  /** Field key → what is wrong with it. */
  errors: Record<string, string> = {};
  get errorCount(): number { return Object.keys(this.errors).length; }

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
    const e: Record<string, string> = {};

    if (!f.childName.trim()) e['child'] = "Enter the child's name.";
    if (!f.session) e['session'] = 'Choose the session.';
    if (!f.childDateOfBirth) e['dob'] = 'Enter the date of birth.';
    else if (f.childDateOfBirth > this.today) e['dob'] = 'The date of birth cannot be in the future.';
    else {
      const months = monthsBetween(f.childDateOfBirth, this.today);
      if (months < 12 || months > 96) e['dob'] = 'Check the date of birth: the child should be about 1 to 8 years old.';
    }
    if (!f.gender) e['gender'] = 'Choose Female or Male.';
    if (!f.classWanted) e['class'] = 'Choose the class.';

    // Anyone whose details are started must be complete enough to call.
    let complete = 0;
    for (const p of this.people) {
      const name = t(f[p.name]);
      const phone = t(f[p.phone]);
      const address = t(f[p.address]);
      const email = p.email ? t(f[p.email]) : null;
      const started = name || phone || address || email || t(f[p.occupation]);
      if (!started) continue;
      if (!name) e[p.key + 'Name'] = `Enter the ${p.key}'s name.`;
      if (!phone) e[p.key + 'Phone'] = 'Enter a 10-digit contact number.';
      else if (!PHONE.test(phone)) e[p.key + 'Phone'] = 'The contact number must be 10 digits.';
      if (email && !EMAIL.test(email)) e[p.key + 'Email'] = 'Check the email address.';
      if (name && phone && PHONE.test(phone)) {
        if (address) complete++;
        else e[p.key + 'Address'] = 'Enter the address for communication.';
      }
    }
    if (complete === 0 && !this.people.some(p => e[p.key + 'Address'] || e[p.key + 'Name'] || e[p.key + 'Phone'])) {
      e['contact'] = 'No parent or guardian details yet.';
      e['motherName'] = "Enter the mother's name (or the father's or guardian's below).";
    }
    if (f.heardFrom.length === 0) e['heard'] = 'Tick at least one.';

    this.errors = e;
    if (this.errorCount) {
      // After Angular paints the red fields, bring the first one into view.
      setTimeout(() => this.host.nativeElement.querySelector('.ef__bad, .ef__note--bad')
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
      return;
    }

    this.submitted.emit({
      ...f,
      childName: f.childName.trim(),
      motherName: t(f.motherName), motherOccupation: t(f.motherOccupation), motherPhone: t(f.motherPhone),
      motherEmail: t(f.motherEmail), motherAddress: t(f.motherAddress),
      fatherName: t(f.fatherName), fatherOccupation: t(f.fatherOccupation), fatherPhone: t(f.fatherPhone),
      fatherEmail: t(f.fatherEmail), fatherAddress: t(f.fatherAddress),
      guardianName: t(f.guardianName), guardianOccupation: t(f.guardianOccupation), guardianPhone: t(f.guardianPhone),
      guardianAddress: t(f.guardianAddress)
    });
  }
}

/** Whole months from one "yyyy-MM-dd" to another. */
function monthsBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm) - (td < fd ? 1 : 0);
}
