import { LegalLayout } from '../layouts/LegalLayout'

export function PrivacyPolicy() {
  return (
    <LegalLayout title="Privacy Policy" updated="September 2026">
      <p>
        ResearchOS is an individual student portfolio project built and operated by Stephan Wasalathanthrige
        (contact: <a href="mailto:stephanwasalathanthrige@gmail.com">stephanwasalathanthrige@gmail.com</a>), not a
        registered company. This policy explains what the app collects, why, and what happens to it.
      </p>

      <h2>Information collected</h2>
      <ul>
        <li>Account information: name, email address, and a bcrypt-hashed password (or, if you use Google Sign-In, your Google account's name, email, and profile picture).</li>
        <li>Content you submit: the research questions you ask and any projects you create to organize them.</li>
        <li>Data the app generates on your behalf: research reports, the sources found while researching, and a run history, all tied to your account.</li>
        <li>Session/device information: an opaque session token and the browser's user-agent string, so you can see and revoke your own signed-in devices on the Security page.</li>
      </ul>

      <h2>Why it's collected</h2>
      <p>
        Account information is required to sign you in and keep your research private to you. Your questions and
        the resulting reports, sources, and history are stored so you can return to past research, organize it into
        projects, and regenerate a report without re-running the whole pipeline.
      </p>

      <h2>How it's used, and third parties involved</h2>
      <ul>
        <li><strong>Google Gemini API</strong> - your research question and the evidence gathered for it are sent to Gemini to plan the research, evaluate findings, and write the final report.</li>
        <li><strong>DuckDuckGo Search</strong> - the app's search tool sends search queries to DuckDuckGo when the AI decides a web search is needed.</li>
        <li><strong>Arbitrary source websites</strong> - when the AI decides to read a specific page in full, the app's server fetches that page's URL directly, so that site receives a request from the app (not from your browser).</li>
        <li><strong>Google Sign-In</strong> (optional) - if you choose to sign in with Google, Google verifies your identity and shares your basic profile with the app.</li>
        <li><strong>Resend</strong> - used only to deliver password-reset emails when you request one.</li>
      </ul>
      <p>Each of these services processes only what it needs to perform its function and is governed by its own privacy policy.</p>

      <h2>Cookies and local storage</h2>
      <p>
        The app does not use cookies. It stores two things in your browser's local storage, on your own device only:
        your session token (so you stay signed in) and your light/dark theme preference. Neither is shared with any
        third party, and neither is used for advertising or cross-site tracking. No analytics or advertising scripts
        are loaded.
      </p>

      <h2>Data retention</h2>
      <p>
        Your account, projects, research history, and sources are kept until you ask for them to be deleted. You can
        delete individual projects, research runs, and saved sources yourself from within the app, and revoke
        individual sessions from the Security page. There is currently no self-service "delete my account" button;
        to request full account and data deletion, email the contact address above.
      </p>

      <h2>Data security</h2>
      <p>
        Passwords are hashed with bcrypt and are never logged or returned by any part of the app. Every project,
        research run, and source is scoped to your account, and a request for another user's data is rejected the
        same way a non-existent one would be, so it can't be used to confirm what exists.
      </p>

      <h2>Data sharing</h2>
      <p>
        Your data is not sold, and it is not shared for advertising. It is shared only with the third-party services
        listed above, and only as needed for the app to function.
      </p>

      <h2>Your rights</h2>
      <p>
        You can view and update your profile, change your password, and revoke sessions at any time from Settings.
        You can request a copy of your data or full account deletion by emailing the contact address above.
      </p>

      <h2>Changes to this policy</h2>
      <p>This policy may be updated as the app changes. Check this page for the current version.</p>

      <h2>Jurisdiction note</h2>
      <p>
        This is a personal project operated from Sri Lanka. It has not been reviewed by a lawyer, and this policy is
        not a substitute for legal advice. If you have concerns about data protection requirements that apply to
        you, please contact the operator directly.
      </p>
    </LegalLayout>
  )
}
