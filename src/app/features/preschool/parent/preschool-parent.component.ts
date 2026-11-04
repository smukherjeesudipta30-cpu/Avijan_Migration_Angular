import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { PreSchoolPublic } from '../../../core/models/preschool.model';
import { AuthService } from '../../../core/services/auth.service';
import { PreSchoolService } from '../../../core/services/preschool.service';
import { PreSchoolClosuresComponent } from '../../../shared/preschool-closures/preschool-closures.component';

/**
 * Where a parent lands after signing in. Their child's fees, report cards and
 * certificate are added here with admissions (phase 3); until then it greets
 * them and shows how to reach the school.
 */
@Component({
  selector: 'app-preschool-parent',
  standalone: true,
  imports: [RouterLink, PreSchoolClosuresComponent],
  template: `
    @if (!isParent()) {
      <p class="psp__preview"><i class="pi pi-eye" aria-hidden="true"></i> Preview: this is the page a parent sees after signing in.</p>
    }

    <section class="psp">
      <span class="psp__art" aria-hidden="true">🧸</span>
      <h1>Welcome{{ isParent() && name() ? ', ' + name() : '' }}</h1>
      <p>This is your Avijan PreSchool page. Your child's fee receipts, pending fees, report cards and certificate will appear here.</p>
    </section>

    <div class="psp__cards">
      <section class="app-card psp__card">
        <h2><i class="pi pi-receipt" aria-hidden="true"></i> Fees</h2>
        <p class="app-muted">Receipts and months due, once your child's admission is entered.</p>
      </section>
      <section class="app-card psp__card">
        <h2><i class="pi pi-star" aria-hidden="true"></i> Results</h2>
        <p class="app-muted">Marks and grades from every exam, and the report card.</p>
      </section>
      <section class="app-card psp__card">
        <h2><i class="pi pi-verified" aria-hidden="true"></i> Certificate</h2>
        <p class="app-muted">Ready to download when your child completes the class.</p>
      </section>
    </div>

    @if (school(); as s) {
      <div class="psp__closures"><app-preschool-closures [holidays]="s.holidays" /></div>
    }

    @if (school(); as s) {
      <section class="app-card psp__contact">
        <h2>{{ s.schoolName }}</h2>
        @if (s.address) { <p><i class="pi pi-map-marker" aria-hidden="true"></i> {{ s.address }}</p> }
        @if (s.phone) { <p><i class="pi pi-phone" aria-hidden="true"></i> <a [href]="'tel:' + s.phone">{{ s.phone }}</a></p> }
        @if (s.email) { <p><i class="pi pi-envelope" aria-hidden="true"></i> <a [href]="'mailto:' + s.email">{{ s.email }}</a></p> }
        @if (s.mapUrl) { <p><i class="pi pi-directions" aria-hidden="true"></i> <a [href]="s.mapUrl" target="_blank" rel="noopener">Get directions</a></p> }
        <p><a routerLink="/preschool">Visit the PreSchool website</a></p>
      </section>
    }
  `,
  styles: [`
    .psp__preview { max-width: 46rem; margin: 0 auto 0.75rem; padding: 0.5rem 0.8rem; border-radius: 8px;
      background: #fff1d6; color: #7a4a00; font-size: 0.85rem; display: flex; gap: 0.4rem; align-items: center; }
    .psp { max-width: 46rem; margin: 0 auto; padding: 1.8rem 1.5rem; text-align: center; border-radius: 20px;
      background: linear-gradient(135deg, #ffe3ec, #e3f2ff); color: #2a2f45; }
    .psp__art { font-size: 3rem; }
    .psp h1 { margin: 0.5rem 0; font-size: 1.5rem; }
    .psp p { margin: 0.5rem 0 0; }
    .psp__cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(13rem, 1fr)); gap: 0.9rem; max-width: 46rem; margin: 1rem auto 0; }
    .psp__card, .psp__contact { padding: 1rem 1.1rem; }
    .psp__card h2 { margin: 0 0 0.3rem; font-size: 1rem; display: flex; gap: 0.45rem; align-items: center; }
    .psp__card h2 i { color: #6d28d9; }
    .psp__card p { margin: 0; font-size: 0.85rem; }
    .psp__closures { max-width: 46rem; margin: 1rem auto 0; }
    .psp__contact { max-width: 46rem; margin: 1rem auto 0; }
    .psp__contact h2 { margin: 0 0 0.5rem; font-size: 1.05rem; }
    .psp__contact p { margin: 0.3rem 0; display: flex; gap: 0.45rem; align-items: flex-start; }
  `]
})
export class PreSchoolParentComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly preschool = inject(PreSchoolService);

  readonly school = signal<PreSchoolPublic | null>(null);

  /** A SuperAdmin passes every role check, so ask about the role itself. */
  readonly isParent = computed(() => (this.auth.user()?.roles ?? []).includes('Parent'));
  readonly name = computed(() => this.auth.user()?.name?.split(' ')[0] ?? '');

  ngOnInit(): void {
    this.preschool.publicPage().subscribe({ next: s => this.school.set(s) });
  }
}
