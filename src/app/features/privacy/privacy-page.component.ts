import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * The privacy policy at /privacy, for the website and the Android app alike.
 * Public and outside the shell: Google Play links to it from the store listing,
 * and requires a link to it inside the app (the login page and the front-page
 * footer carry one).
 *
 * The text states what the server actually stores. A change to what is
 * collected or who receives it means a change here, and to the Play Console
 * Data safety answers.
 */
@Component({
  selector: 'app-privacy-page',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="pv">
      <header class="pv__head">
        <a routerLink="/" class="pv__logo"><img src="images/logo.png" alt="Avijan" /></a>
        <h1>Privacy Policy</h1>
        <p class="app-muted">Last updated: {{ updated }}</p>
      </header>

      <main class="pv__body">
        <p>Avijan Computer Centre ("Avijan", "we") runs the website avijan.in and the Avijan Android app
          (package in.avijan.institute). This policy explains what personal information we collect, why, and the
          choices you have. Registered address: 12, Rajpur Banstala, Aghore Sarani Road, P.O. Rajpur,
          P.S. Sonarpur, South 24 Parganas, West Bengal 700149, India.</p>

        <h2>1. Who uses the app</h2>
        <p>The app is for Avijan's enrolled students, their guardians, teachers, receptionists and administrators.
          Accounts are created by Avijan's office; you cannot sign up for an account in the app yourself. Anyone can
          view the public pages, send an enquiry, apply for a job or register for a competition.</p>

        <h2>2. Information we collect</h2>
        <ul>
          <li><strong>Student records:</strong> name, guardian's name, address, phone number, email, date of birth,
            course, branch, dates of joining and leaving, and photos the office uploads.</li>
          <li><strong>Fees and payments:</strong> fees due, amounts paid, payment dates, payment mode, and reference
            numbers you give us for UPI or Paytm payments. We do not collect or store card or bank account numbers;
            payments are made outside the app.</li>
          <li><strong>Staff records:</strong> name, phone, email, qualification, designation and branch for teachers
            and receptionists, and a profile photo if one is added.</li>
          <li><strong>Staff attendance:</strong> when a staff member marks attendance in the app, we record the time
            and their precise location (latitude, longitude and accuracy) at that moment, to confirm they are at the
            branch. Location is only read when attendance is marked, never in the background.</li>
          <li><strong>Chat and calls:</strong> messages and files sent in the app's chat, with the sender and time.
            Voice and video calls go directly between devices where possible; we do not record calls.</li>
          <li><strong>Enquiries, job applications and competition registrations:</strong> the details you type into
            those forms, such as name, phone, email, address and message. Job applications include the CV and photo
            you upload. Competition registrations include the participant's name, date of birth, school, class and
            guardian's details, and are filled in by a parent or guardian.</li>
          <li><strong>Sign-in and device data:</strong> your sign-in email, and a notification token for your device
            so we can send you chat and call notifications.</li>
          <li><strong>Website visits:</strong> the page visited, the date, the type of device and a random visitor
            number, used only to count visits. We do not use advertising or tracking cookies.</li>
        </ul>

        <h2>3. Why we use it</h2>
        <p>To run the institute: admissions, classes, exams, certificates, fee receipts, staff attendance and pay, and
          communication between students, guardians and staff. We do not sell personal information or use it for
          advertising.</p>

        <h2>4. Who we share it with</h2>
        <ul>
          <li><strong>Service providers that run the service for us:</strong> our hosting provider (servers and
            database), Google Firebase Cloud Messaging (to deliver notifications) and our email provider (to send
            receipts and sign-in codes). They act on our instructions only.</li>
          <li><strong>An AI service, for exam questions only:</strong> teachers can ask an AI service to draft exam
            questions from a course topic. Only the topic is sent, never personal information.</li>
          <li><strong>When the law requires it</strong>, for example to a court or the police.</li>
        </ul>
        <p>We do not share personal information with anyone else.</p>

        <h2>5. Security</h2>
        <p>All data travels between the app and our server over an encrypted (HTTPS) connection. Access inside the
          app is limited by role, so for example a student sees only their own records.</p>

        <h2>6. How long we keep it</h2>
        <p>Student and fee records are kept while you study with us and afterwards for as long as Indian tax and
          accounting law requires. Enquiries, job applications and competition registrations are kept for up to
          3 years. Chat messages are kept until deleted.</p>

        <h2>7. Your choices and rights</h2>
        <p>You can ask us to see, correct or delete your personal information, or to close your account, by emailing
          <a href="mailto:mail.avijan@gmail.com">mail.avijan&#64;gmail.com</a> or visiting any branch
          (<a routerLink="/delete-account">how to ask for deletion</a>). We will reply within 30 days. Some records, such as fee receipts, may have to be kept to meet legal requirements; we will
          tell you if so. You can turn off notifications and location for the app at any time in your phone's
          settings.</p>

        <h2>8. Children</h2>
        <p>Student and competition records for children are given to us by a parent or guardian, who can ask to see,
          correct or delete them as above.</p>

        <h2>9. Changes</h2>
        <p>If we change this policy, we will update the date at the top and post the new version here.</p>

        <h2>10. Contact</h2>
        <p>Avijan Computer Centre, email <a href="mailto:mail.avijan@gmail.com">mail.avijan&#64;gmail.com</a>,
          phone <a href="tel:+919433883381">+91 94338 83381</a>, at the address above.</p>
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
    .pv__body ul { padding-left: 1.2rem; }
    .pv__body li { margin-bottom: 0.4rem; }
    .pv__foot { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid var(--app-border); }
  `]
})
export class PrivacyPageComponent {
  /** Bump this with every change to the text. */
  readonly updated = '29 October 2026';
}
