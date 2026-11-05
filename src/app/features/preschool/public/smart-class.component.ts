import { Component, input } from '@angular/core';

/**
 * The "Smart classroom" band on the PreSchool landing page. Shows the school's
 * own photo once the PreSchool admin puts one up in School Settings; until
 * then, a drawn smart-board classroom stands in for it.
 */
@Component({
  selector: 'app-smart-class',
  standalone: true,
  template: `
    <section class="sc">
      <figure class="sc__pic">
        @if (photoUrl(); as src) {
          <img [src]="src" alt="Children learning on the smart board in an Avijan PreSchool classroom" loading="lazy" />
        } @else {
          <svg viewBox="0 0 640 400" role="img" aria-label="Children learning on a smart board in the classroom">
            <defs>
              <linearGradient id="sc-screen" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stop-color="#60a5fa" /><stop offset="1" stop-color="#a78bfa" />
              </linearGradient>
            </defs>
            <rect width="640" height="400" fill="#fff4e6" />
            <rect y="300" width="640" height="100" fill="#fde2c4" />
            <rect x="24" y="70" width="90" height="120" rx="10" fill="#d9ecff" stroke="#fff" stroke-width="8" />
            <line x1="69" y1="70" x2="69" y2="190" stroke="#fff" stroke-width="6" />
            <circle cx="575" cy="80" r="26" fill="#ffe08a" />
            <!-- The smart board -->
            <rect x="150" y="44" width="340" height="206" rx="14" fill="#1f2937" />
            <rect x="162" y="56" width="316" height="182" rx="6" fill="url(#sc-screen)" />
            <text x="190" y="128" font-family="Nunito, Segoe UI, sans-serif" font-size="54" font-weight="800" fill="#fff">A B C</text>
            <text x="196" y="196" font-family="Nunito, Segoe UI, sans-serif" font-size="44" font-weight="800" fill="#fde68a">1 2 3</text>
            <circle cx="420" cy="112" r="30" fill="#fbbf24" />
            <path d="M405 108 q15 18 30 0" stroke="#92400e" stroke-width="4" fill="none" stroke-linecap="round" />
            <circle cx="410" cy="100" r="3.5" fill="#92400e" /><circle cx="430" cy="100" r="3.5" fill="#92400e" />
            <circle cx="398" cy="186" r="20" fill="#ef4444" /><path d="M398 166 q6 -10 14 -10" stroke="#16a34a" stroke-width="5" fill="none" />
            <circle cx="446" cy="190" r="14" fill="#34d399" />
            <rect x="300" y="250" width="40" height="40" fill="#374151" /><rect x="270" y="286" width="100" height="10" rx="5" fill="#374151" />
            <!-- The teacher, pointing at the board -->
            <path d="M520 300 q0 -95 40 -95 q40 0 40 95 z" fill="#ec4899" />
            <circle cx="560" cy="182" r="24" fill="#e0ac69" />
            <path d="M536 180 q2 -34 26 -32 q26 2 22 34 q-6 -18 -24 -20 q-16 2 -24 18 z" fill="#3f2a1d" />
            <path d="M532 232 L470 196" stroke="#e0ac69" stroke-width="12" stroke-linecap="round" />
            <!-- Children in the front row -->
            <g>
              <path d="M70 400 q0 -62 44 -62 q44 0 44 62 z" fill="#f97316" /><circle cx="114" cy="318" r="26" fill="#c68642" />
              <path d="M88 312 q4 -30 28 -28 q24 2 24 28 q-12 -12 -26 -12 q-14 0 -26 12 z" fill="#2d1b10" />
              <path d="M190 400 q0 -58 42 -58 q42 0 42 58 z" fill="#3b82f6" /><circle cx="232" cy="322" r="24" fill="#e0ac69" />
              <path d="M206 318 q2 -30 26 -28 q24 2 24 28 q-6 4 -10 -6 q-14 -10 -30 0 q-4 10 -10 6 z" fill="#1f130b" />
              <circle cx="206" cy="330" r="7" fill="#1f130b" /><circle cx="258" cy="330" r="7" fill="#1f130b" />
              <path d="M310 400 q0 -60 44 -60 q44 0 44 60 z" fill="#22c55e" /><circle cx="354" cy="320" r="25" fill="#8d5524" />
              <path d="M330 314 q4 -30 26 -28 q22 2 22 28 q-10 -14 -24 -14 q-14 0 -24 14 z" fill="#140c07" />
              <path d="M430 400 q0 -56 40 -56 q40 0 40 56 z" fill="#a855f7" /><circle cx="470" cy="326" r="23" fill="#c68642" />
              <path d="M447 322 q2 -28 24 -26 q22 2 22 26 q-4 8 -10 -2 q-14 -12 -28 0 q-4 10 -8 2 z" fill="#2d1b10" />
            </g>
            <rect x="24" y="22" width="132" height="32" rx="16" fill="#ff6b8b" />
            <text x="90" y="44" text-anchor="middle" font-family="Nunito, Segoe UI, sans-serif" font-size="16" font-weight="800" fill="#fff">Smart Class</text>
          </svg>
        }
      </figure>
      <div class="sc__text">
        <span class="sc__pill">Smart classroom</span>
        <h2>Learning comes alive on the smart board</h2>
        <p>Rhymes, phonics, numbers, colours and stories on a big interactive smart board, so little ones
          see, hear, touch and learn together.</p>
        <ul>
          <li><span aria-hidden="true">🔤</span> Letters and phonics with sound and pictures</li>
          <li><span aria-hidden="true">🔢</span> Counting games children can tap and play</li>
          <li><span aria-hidden="true">🎶</span> Rhymes and story videos, picked by our teachers</li>
        </ul>
      </div>
    </section>
  `,
  styles: [`
    .sc { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 2rem; align-items: center; max-width: 1150px; margin: 0 auto;
      padding: 2.5rem 1.25rem; }
    .sc__pic { margin: 0; border-radius: 28px; overflow: hidden; background: #fff; box-shadow: 0 12px 32px rgba(42, 47, 69, 0.1);
      aspect-ratio: 16 / 10; }
    .sc__pic img, .sc__pic svg { width: 100%; height: 100%; object-fit: cover; display: block; }
    .sc__pill { display: inline-block; padding: 0.3rem 0.9rem; border-radius: 999px; background: #e3f2ff; color: #1d5fa8;
      font-weight: 700; font-size: 0.85rem; }
    .sc__text h2 { margin: 0.7rem 0 0.6rem; font-size: 2rem; line-height: 1.15; }
    .sc__text p { margin: 0; color: #5b6178; line-height: 1.6; }
    .sc__text ul { list-style: none; padding: 0; margin: 1rem 0 0; display: grid; gap: 0.5rem; font-weight: 600; }
    .sc__text li span { font-size: 1.2rem; margin-right: 0.35rem; }
    @media (max-width: 820px) { .sc { grid-template-columns: 1fr; gap: 1.25rem; } .sc__text h2 { font-size: 1.6rem; } }
  `]
})
export class SmartClassComponent {
  /** The school's own classroom photo; empty shows the drawing. */
  readonly photoUrl = input<string | null>(null);
}
