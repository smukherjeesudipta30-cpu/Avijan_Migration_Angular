import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * How to ask for an account and its data to be deleted, at /delete-account.
 * Google Play's Data safety form asks for a page that explains exactly this,
 * because the public competition portal lets a guardian create a login. The
 * office carries the request out; there is no self-service deletion.
 */
@Component({
  selector: 'app-delete-account-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="pv">
      <header class="pv__head">
        <a routerLink="/" class="pv__logo"><img src="images/logo.png" alt="Avijan" /></a>
        <h1>Delete your account or data</h1>
        <p class="app-muted">Avijan Computer Centre &middot; website avijan.in and the Avijan Android app (in.avijan.institute)</p>
      </header>

      <main class="pv__body">
        <h2>How to ask</h2>
        <ol>
          <li>Email <a href="mailto:mail.avijan@gmail.com?subject=Delete%20my%20account">mail.avijan&#64;gmail.com</a>
            with the subject <strong>"Delete my account"</strong>, or visit any Avijan branch.</li>
          <li>Tell us the email address or phone number on the account. For a competition registration, give the
            registration code as well.</li>
          <li>Say whether you want the whole account deleted, or only some of your data (for example your photos or
            chat messages).</li>
        </ol>
        <p>We may call you on the phone number we hold to confirm the request is yours. We complete it within
          30 days and tell you when it is done.</p>

        <h2>What is deleted</h2>
        <ul>
          <li>Your sign-in account, so you can no longer sign in.</li>
          <li>Your profile details and photos, chat messages and files, notification tokens, and any enquiry,
            job application or competition registration.</li>
        </ul>

        <h2>What we have to keep</h2>
        <p>Fee receipts and payment records are kept for as long as Indian tax and accounting law requires, and
          certificates already issued stay verifiable. These are kept with only the details the law needs and are
          not used for anything else.</p>

        <p>See also our <a routerLink="/privacy">Privacy Policy</a>.</p>
      </main>

      <footer class="pv__foot"><a routerLink="/">Back to Avijan</a></footer>
    </div>
  `,
  styles: [`
    :host { display: block; background: var(--app-surface, #fff); min-height: 100vh; }
    .pv { max-width: 46rem; margin: 0 auto; padding: 1.5rem 1rem 3rem; line-height: 1.6; }
    .pv__head { border-bottom: 1px solid var(--app-border); padding-bottom: 1rem; margin-bottom: 1rem; }
    .pv__logo img { height: 3rem; }
    .pv__head h1 { margin: 0.75rem 0 0.25rem; font-size: 1.6rem; }
    .pv__head p { margin: 0; }
    .pv__body h2 { font-size: 1.1rem; margin: 1.5rem 0 0.4rem; }
    .pv__body ul, .pv__body ol { padding-left: 1.2rem; }
    .pv__body li { margin-bottom: 0.4rem; }
    .pv__foot { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--app-border); }
  `]
})
export class DeleteAccountPageComponent {}
