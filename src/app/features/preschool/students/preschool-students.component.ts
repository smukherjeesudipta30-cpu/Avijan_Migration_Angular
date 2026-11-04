import { DatePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
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

    <div class="app-card pss-table">
      <div class="pss-row pss-row--head">
        <span>Child</span><span>Class</span><span>Parent · phone</span><span>Joined</span><span class="r">Monthly</span><span class="r">Due</span>
      </div>
      @for (s of list(); track s.id) {
        <a class="pss-row" [routerLink]="['/preschool/students', s.id]">
          <span><strong>{{ s.childName }}</strong><small>{{ s.admissionCode }}@if (s.status !== 'Active') { · {{ s.status }} }</small></span>
          <span>{{ s.className }}</span>
          <span>{{ s.parentName }}<small>{{ s.phone }}</small></span>
          <span>{{ s.joinedOn | date: 'd MMM y' }}</span>
          <span class="r">{{ money(s.monthlyFee) }}</span>
          <span class="r">
            @if (s.amountDue > 0) {
              <span class="pss-due">{{ money(s.amountDue) }}@if (s.monthsDue) { · {{ s.monthsDue }} mth }@if (s.admissionDue) { · admission }</span>
            } @else { <span class="pss-ok">Paid up</span> }
          </span>
        </a>
      } @empty {
        @if (loaded()) { <p class="app-muted pss-empty">No children match. Use New admission to add one.</p> }
      }
    </div>
  `,
  styles: [`
    .pss-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
    .pss-new { display: inline-flex; gap: 0.45rem; align-items: center; padding: 0.65rem 1.1rem; border-radius: 999px;
      background: #ff6b8b; color: #fff; font-weight: 700; text-decoration: none; }
    .pss-filters { display: flex; gap: 0.6rem; flex-wrap: wrap; margin: 0.5rem 0 1rem; }
    .pss-filters input { min-width: 16rem; }
    .pss-filters select { padding: 0.5rem 0.6rem; border: 1px solid var(--app-border); border-radius: 6px; background: #fff; font: inherit; }
    .pss-table { padding: 0; overflow: hidden; }
    .pss-row { display: grid; grid-template-columns: 1.4fr 0.8fr 1.3fr 0.8fr 0.7fr 1fr; gap: 0.6rem; align-items: center;
      padding: 0.7rem 1rem; border-bottom: 1px solid var(--app-border); color: inherit; text-decoration: none; }
    a.pss-row:hover { background: #faf7ff; }
    .pss-row span { min-width: 0; }
    .pss-row small { display: block; color: var(--app-text-muted); font-size: 0.78rem; }
    .pss-row--head span { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; color: var(--app-text-muted); }
    .r { text-align: right; }
    .pss-due { display: inline-block; padding: 0.15rem 0.55rem; border-radius: 999px; background: #fde8e8; color: #b42318; font-weight: 700; font-size: 0.82rem; }
    .pss-ok { display: inline-block; padding: 0.15rem 0.55rem; border-radius: 999px; background: #e6f8e6; color: #2b7a2b; font-weight: 700; font-size: 0.82rem; }
    .pss-empty { padding: 1rem; margin: 0; }
    @media (max-width: 800px) {
      .pss-row { grid-template-columns: 1fr auto; }
      .pss-row > span:nth-child(2), .pss-row > span:nth-child(3), .pss-row > span:nth-child(4), .pss-row > span:nth-child(5) { display: none; }
    }
  `]
})
export class PreSchoolStudentsComponent implements OnInit {
  private readonly students = inject(PreSchoolStudentService);
  private readonly preschool = inject(PreSchoolService);

  readonly list = signal<PreSchoolStudentListItem[]>([]);
  readonly classes = signal<PreSchoolClass[]>([]);
  readonly loaded = signal(false);
  readonly money = formatMoney;

  search = '';
  classId: number | null = null;
  status = 'Active';

  ngOnInit(): void {
    this.preschool.overview().subscribe(o => this.classes.set(o.classes));
    this.load();
  }

  load(): void {
    this.students.list({ search: this.search.trim(), classId: this.classId, status: this.status })
      .subscribe(items => { this.list.set(items); this.loaded.set(true); });
  }
}
