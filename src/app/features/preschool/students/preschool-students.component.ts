import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';

import { formatMoney } from '../../../core/format/money';
import { PreSchoolClass } from '../../../core/models/preschool.model';
import { PreSchoolStudentListItem } from '../../../core/models/preschool-student.model';
import { PreSchoolService } from '../../../core/services/preschool.service';
import { PreSchoolStudentService } from '../../../core/services/preschool-student.service';

/** Every child at the PreSchool, with what each owes. The PreSchool office's daily list. */
@Component({
  selector: 'app-preschool-students',
  standalone: true,
  imports: [DatePipe, FormsModule, RouterLink, ButtonModule, InputTextModule],
  template: `
    <div class="pss-head">
      <div class="app-page-head">
        <span class="app-eyebrow">Avijan PreSchool</span>
        <h1>Students</h1>
        <p class="app-muted">Open a child to see their months, collect fees and print the receipt.</p>
      </div>
      <a routerLink="/preschool/students/new" class="pss-new"><i class="pi pi-user-plus" aria-hidden="true"></i> New admission</a>
    </div>

    <div class="pss-filters">
      <input pInputText placeholder="Name, phone or admission no." [(ngModel)]="search" (keyup.enter)="load()" />
      <select [(ngModel)]="classId" (ngModelChange)="load()">
        <option [ngValue]="null">All classes</option>
        @for (c of classes(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }
      </select>
      <select [(ngModel)]="status" (ngModelChange)="load()">
        <option value="Active">Studying now</option>
        <option value="Completed">Completed</option>
        <option value="Left">Left</option>
        <option value="">Everyone</option>
      </select>
      <p-button label="Search" icon="pi pi-search" (onClick)="load()" />
    </div>

    <div class="pss-stats">
      <span><strong>{{ list().length }}</strong> children</span>
      <span><strong>{{ owing() }}</strong> owe fees</span>
      <span><strong>{{ money(totalDue()) }}</strong> due in all</span>
    </div>

    <div class="app-card pss-wrap">
      <table class="pss-table">
        <thead>
          <tr>
            <th>Adm. No.</th><th>Child</th><th>Class</th><th>Sec.</th><th>Parent</th><th>Phone</th><th>Joined</th>
            <th class="r">Monthly</th><th class="r">Due</th><th></th>
          </tr>
        </thead>
        <tbody>
          @for (s of list(); track s.id) {
            <tr (click)="open(s.id)" [class.pss-off]="s.status !== 'Active'">
              <td class="pss-code">{{ s.admissionCode }}</td>
              <td><a [routerLink]="['/preschool/students', s.id]" (click)="$event.stopPropagation()"><strong>{{ s.childName }}</strong></a>
                @if (s.status !== 'Active') { <small class="pss-status">{{ s.status }}</small> }</td>
              <td>{{ s.className }}</td>
              <td>{{ s.section || '—' }}</td>
              <td>{{ s.parentName }}</td>
              <td><a [href]="'tel:' + s.phone" (click)="$event.stopPropagation()">{{ s.phone }}</a></td>
              <td class="pss-date">{{ s.joinedOn | date: 'd MMM y' }}</td>
              <td class="r">{{ money(s.monthlyFee) }}</td>
              <td class="r">
                @if (s.amountDue > 0) {
                  <span class="pss-due">{{ money(s.amountDue) }}</span>
                  <small class="pss-why">{{ dueWhy(s) }}</small>
                } @else { <span class="pss-ok">Paid up</span> }
              </td>
              <td class="pss-go"><i class="pi pi-angle-right" aria-hidden="true"></i></td>
            </tr>
          }
        </tbody>
      </table>
      @if (loaded() && list().length === 0) { <p class="app-muted pss-empty">No children match. Use New admission to add one.</p> }
      @if (!loaded()) { <p class="app-muted pss-empty"><i class="pi pi-spin pi-spinner"></i> Loading…</p> }
    </div>
  `,
  styles: [`
    .pss-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
    .pss-new { display: inline-flex; gap: 0.45rem; align-items: center; padding: 0.65rem 1.1rem; border-radius: 999px;
      background: #ff6b8b; color: #fff; font-weight: 700; text-decoration: none; }
    .pss-filters { display: flex; gap: 0.6rem; flex-wrap: wrap; margin: 0.5rem 0 0.75rem; }
    .pss-filters input { min-width: 16rem; flex: 1 1 16rem; max-width: 26rem; }
    .pss-filters select { padding: 0.5rem 0.6rem; border: 1px solid var(--app-border); border-radius: 6px; background: #fff; font: inherit; }
    .pss-stats { display: flex; gap: 1.2rem; flex-wrap: wrap; margin: 0 0 0.6rem; font-size: 0.88rem; color: var(--app-text-muted); }
    .pss-stats strong { color: var(--app-text, #1f2430); }
    /* The table keeps every column; on a narrow screen it scrolls sideways instead of hiding them. */
    .pss-wrap { padding: 0; overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .pss-table { width: 100%; min-width: 920px; border-collapse: collapse; font-size: 0.88rem; }
    .pss-table th { position: sticky; top: 0; background: #f8f7fc; text-align: left; padding: 0.6rem 0.75rem; font-size: 0.72rem;
      font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: var(--app-text-muted); border-bottom: 1px solid var(--app-border);
      white-space: nowrap; }
    .pss-table td { padding: 0.6rem 0.75rem; border-bottom: 1px solid var(--app-border); vertical-align: middle; }
    .pss-table tbody tr { cursor: pointer; }
    .pss-table tbody tr:hover { background: #faf7ff; }
    .pss-table tbody tr:nth-child(even) { background: #fcfcfe; }
    .pss-table tbody tr:nth-child(even):hover { background: #faf7ff; }
    .pss-table a { color: inherit; text-decoration: none; }
    .pss-table a:hover { text-decoration: underline; }
    .pss-code { font-family: ui-monospace, Consolas, monospace; font-size: 0.82rem; white-space: nowrap; color: #4c1d95; }
    .pss-date { white-space: nowrap; }
    .pss-off td { color: var(--app-text-muted); }
    .pss-status { display: inline-block; margin-left: 0.35rem; padding: 0 0.4rem; border-radius: 999px; background: #eef0f5; font-size: 0.7rem; }
    .pss-go { width: 1.5rem; color: var(--app-text-muted); }
    .r { text-align: right; white-space: nowrap; }
    .pss-due { display: inline-block; padding: 0.15rem 0.55rem; border-radius: 999px; background: #fde8e8; color: #b42318; font-weight: 700; font-size: 0.82rem; }
    .pss-why { display: block; font-size: 0.72rem; color: var(--app-text-muted); margin-top: 0.15rem; }
    .pss-ok { display: inline-block; padding: 0.15rem 0.55rem; border-radius: 999px; background: #e6f8e6; color: #2b7a2b; font-weight: 700; font-size: 0.82rem; }
    .pss-empty { padding: 1rem; margin: 0; }
  `]
})
export class PreSchoolStudentsComponent implements OnInit {
  private readonly students = inject(PreSchoolStudentService);
  private readonly preschool = inject(PreSchoolService);

  readonly list = signal<PreSchoolStudentListItem[]>([]);
  readonly classes = signal<PreSchoolClass[]>([]);
  readonly loaded = signal(false);
  readonly money = formatMoney;
  private readonly router = inject(Router);

  readonly owing = computed(() => this.list().filter(s => s.amountDue > 0).length);
  readonly totalDue = computed(() => this.list().reduce((t, s) => t + s.amountDue, 0));

  open(id: number): void {
    void this.router.navigate(['/preschool/students', id]);
  }

  /** "2 mth · admission · instalment" — what the amount due is made of. */
  dueWhy(s: PreSchoolStudentListItem): string {
    return [
      s.monthsDue ? `${s.monthsDue} mth` : '',
      s.admissionDue ? 'admission' : '',
      (s.instalmentDue ?? 0) > 0 ? `instalment ${this.money(s.instalmentDue ?? 0)}` : ''
    ].filter(Boolean).join(' · ');
  }

  search = '';
  classId: number | null = null;
  status = 'Active';

  ngOnInit(): void {
    this.preschool.overview().subscribe(o => this.classes.set(o.classes));
    this.load();
  }

  load(): void {
    this.loaded.set(false);
    this.students.list({ search: this.search.trim(), classId: this.classId, status: this.status })
      .subscribe(items => { this.list.set(items); this.loaded.set(true); });
  }
}
