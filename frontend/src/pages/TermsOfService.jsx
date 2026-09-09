import { LegalLayout } from '../layouts/LegalLayout'

export function TermsOfService() {
  return (
    <LegalLayout title="Terms and Conditions" updated="September 2026">
      <p>
        ResearchOS is an individual student portfolio project operated by Stephan Wasalathanthrige (contact:{' '}
        <a href="mailto:stephanwasalathanthrige@gmail.com">stephanwasalathanthrige@gmail.com</a>), not a commercial
        service. By creating an account you agree to these terms.
      </p>

      <h2>The service</h2>
      <p>
        ResearchOS lets you submit a question and watch a multi-agent pipeline (Planner, Researchers, a Reviewer,
        and a Writer) turn it into a cited report using web search and Google's Gemini API. Reports are AI-generated:
        they are grounded in the sources the pipeline actually found, but they can still be incomplete or contain
        mistakes. Do not treat a report as professional, medical, legal, or financial advice.
      </p>

      <h2>Your account</h2>
      <p>
        You're responsible for keeping your password and signed-in sessions secure, and for the accuracy of the
        information you provide when signing up. You can review and revoke your active sessions at any time from
        Settings.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Don't use the service for anything illegal, or to generate content intended to mislead others.</li>
        <li>Don't attempt to abuse, overload, or circumvent rate limits on the service or the third-party APIs it relies on.</li>
        <li>Don't attempt to access another user's account, projects, or research data.</li>
        <li>Don't scrape, reverse engineer, or resell the service.</li>
      </ul>

      <h2>Intellectual property</h2>
      <p>
        The reports and sources generated for your own research questions are yours to use. The application's code,
        design, and branding belong to the operator. Source material the pipeline reads or cites remains the
        property of its original publishers, subject to their own terms.
      </p>

      <h2>No warranty and limitation of liability</h2>
      <p>
        This service is provided "as is," on free-tier infrastructure, with no uptime guarantee. To the fullest
        extent permitted by law, the operator is not liable for inaccuracies in AI-generated reports, service
        interruptions, or any loss arising from your use of the service. Use it at your own discretion.
      </p>

      <h2>Third-party services</h2>
      <p>
        The service relies on Google Gemini, DuckDuckGo Search, optional Google Sign-In, and Resend for password-reset
        email delivery. Your use of features backed by these services is also subject to those providers' own terms.
      </p>

      <h2>Availability and changes</h2>
      <p>
        As a student project, this service may be modified, rate-limited, suspended, or discontinued at any time
        without notice.
      </p>

      <h2>Changes to these terms</h2>
      <p>These terms may be updated as the app changes. Continued use after an update means you accept the revised terms.</p>

      <h2>Governing law</h2>
      <p>
        This is a personal project operated from Sri Lanka and these terms have not been reviewed by a lawyer. They
        are not a substitute for legal advice, and no specific governing law or jurisdiction is asserted here beyond
        that.
      </p>
    </LegalLayout>
  )
}
