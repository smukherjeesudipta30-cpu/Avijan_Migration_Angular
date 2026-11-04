import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * The two Avijan schools as tabs across the top of each public front page:
 * the Computer Centre's at / and the PreSchool's at /preschool.
 */
@Component({
  selector: 'app-school-tabs',
  standalone: true,
  imports: [RouterLink],
  template: `
    <nav class="st" aria-label="Avijan schools">
      <a routerLink="/" class="st__tab" [class.st__tab--on]="current() === 'computer'"
        [attr.aria-current]="current() === 'computer' ? 'page' : null">
        <span aria-hidden="true">💻</span> Avijan Computer Centre</a>
      <a routerLink="/preschool" class="st__tab" [class.st__tab--on]="current() === 'preschool'"
        [attr.aria-current]="current() === 'preschool' ? 'page' : null">
        <span aria-hidden="true">🎈</span> Avijan PreSchool
        @if (current() !== 'preschool') { <small>New</small> }</a>
    </nav>
  `,
  styles: [`
    .st { display: flex; justify-content: center; gap: 0.5rem; padding: 0.5rem; background: #2a2f45; }
    .st__tab { display: inline-flex; align-items: center; gap: 0.4rem; padding: 0.45rem 1rem; border-radius: 999px;
      color: #c9cede; font-size: 0.9rem; font-weight: 600; text-decoration: none; }
    .st__tab:hover { color: #fff; }
    .st__tab small { padding: 0.05rem 0.45rem; border-radius: 999px; background: #ff6b8b; color: #fff; font-size: 0.7rem; }
    .st__tab--on, .st__tab--on:hover { background: #fff; color: #2a2f45; }
    @media (max-width: 480px) { .st__tab { padding: 0.4rem 0.7rem; font-size: 0.8rem; } }
  `]
})
export class SchoolTabsComponent {
  readonly current = input<'computer' | 'preschool'>('computer');
}
