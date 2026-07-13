/**
 * Terms of Service. Version 1.0, first execution.
 *
 * NOT LEGAL ADVICE. This is a working draft written to be accurate to how
 * DealStudio actually behaves today. It should be reviewed by a Kansas-licensed
 * attorney before it is relied on in a dispute.
 */

import { LegalPage, Clause } from './LegalPage';

export function TermsScreen() {
  return (
    <LegalPage title="Terms of Service" version="Version 1.0" effective="July 12, 2026">
      <p className="text-sm leading-relaxed text-[#4b5563] mb-7">
        These Terms of Service (the "Terms") govern your use of DealStudio&trade;, an investor deal room
        service operated by JM Solutions ("JM Solutions", "we", "us"). By creating an account or
        using the service, you agree to these Terms. If you are agreeing on behalf of a company,
        you represent that you have authority to bind it.
      </p>

      <Clause n={1} title="The service">
        <p>
          DealStudio&trade; lets you publish a private investor deal room: upload a pitch deck and
          supporting documents, present your market and business model, control who has access, and
          see how investors engage with what you have shared.
        </p>
        <p>
          We may change, add, or remove features. If we remove something you materially rely on, we
          will give reasonable notice where we can.
        </p>
      </Clause>

      <Clause n={2} title="Your account">
        <p>
          You must be at least 18 years old. You are responsible for the accuracy of your account
          information, for keeping your credentials secure, and for everything done under your
          account. Tell us promptly at hello@dealstudio.io if you believe your account has been
          compromised.
        </p>
        <p>
          You may invite others to your organization. You are responsible for what your team members
          do in your deal rooms.
        </p>
      </Clause>

      <Clause n={3} title="Your content, and who owns it">
        <p>
          <strong className="text-[#191f1d]">You own your content.</strong> Your pitch deck, your
          documents, your financial model, your investor list, and everything else you upload or
          enter remains yours. We claim no ownership of it.
        </p>
        <p>
          You grant us a limited, non-exclusive licence to host, store, reproduce, and display your
          content, solely to operate the service for you. That licence exists so we can show your
          deal room to the investors you have authorised, and for no other purpose. It ends when you
          delete the content or close your account.
        </p>
        <p>
          <strong className="text-[#191f1d]">We do not sell your content, and we do not use it to
          train machine learning models.</strong>
        </p>
        <p>
          You warrant that you have the right to upload what you upload, and that doing so does not
          infringe anyone else's rights or breach an obligation of confidence you owe to a third
          party.
        </p>
      </Clause>

      <Clause n={4} title="Investor access is yours to control">
        <p>
          You decide who can see a deal room, by password, by invitation, by email gate, or by share
          link. You are responsible for who you give access to and for revoking it when appropriate.
        </p>
        <p>
          A share link grants access to whoever holds it. Treat it accordingly. We cannot control
          what someone does with a link after you send it to them, and we are not responsible for
          onward sharing by a person you granted access to.
        </p>
      </Clause>

      <Clause n={5} title="Acceptable use">
        <p>You agree not to use DealStudio&trade; to:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Upload unlawful, infringing, or knowingly false material.</li>
          <li>Make securities offerings or solicitations that breach applicable law.</li>
          <li>Impersonate another person or company.</li>
          <li>Interfere with the service, probe it for vulnerabilities without permission, or attempt to access another customer's data.</li>
          <li>Resell or white-label the service without our written agreement.</li>
        </ul>
        <p>
          We may suspend an account that breaches this section. Where the breach is not serious, we
          will try to contact you first.
        </p>
      </Clause>

      <Clause n={6} title="Nothing here is investment or legal advice">
        <p>
          DealStudio&trade; is a presentation and access-control tool. We are not a broker-dealer, not an
          investment adviser, and not a party to any transaction between you and an investor. We do
          not verify the accuracy of anything you publish in a deal room, and we make no
          representation to any investor about you or your company.
        </p>
        <p>
          You are solely responsible for the accuracy and legality of what you present, including
          any securities law obligations that apply to your raise.
        </p>
      </Clause>

      <Clause n={7} title="Trials, fees, and cancellation">
        <p>
          New accounts may include a free trial. At the end of a trial, access to paid features
          requires a subscription. Fees are stated in the app before you subscribe.
        </p>
        <p>
          Subscriptions renew automatically for the stated period until cancelled. You may cancel at
          any time, effective at the end of the period you have already paid for. Except where the
          law requires otherwise, fees already paid are not refundable for partial periods.
        </p>
        <p>
          We may change pricing. Changes will not affect a period you have already paid for, and we
          will give reasonable notice before a change applies to your renewal.
        </p>
      </Clause>

      <Clause n={8} title="Confidentiality">
        <p>
          We treat the contents of your deal rooms as confidential. We access them only where
          necessary to operate the service, to resolve a problem you have reported, or where we are
          legally required to.
        </p>
      </Clause>

      <Clause n={9} title="Security">
        <p>
          We take reasonable measures to protect your data, described in our Privacy Policy. No
          service is perfectly secure, and we do not warrant that the service cannot be breached. You
          are responsible for the security of your own devices and credentials.
        </p>
      </Clause>

      <Clause n={10} title="Suspension and termination">
        <p>
          You may close your account at any time. We may suspend or terminate an account for a
          material breach of these Terms, for non-payment, or where required by law.
        </p>
        <p>
          On termination, your right to use the service ends. Export anything you need first.
          Handling of your data after termination is described in our Privacy Policy.
        </p>
      </Clause>

      <Clause n={11} title="Disclaimers">
        <p>
          The service is provided "as is" and "as available". To the fullest extent permitted by
          law, JM Solutions disclaims all warranties, express or implied, including merchantability,
          fitness for a particular purpose, and non-infringement. We do not warrant that the service
          will be uninterrupted, error free, or that it will result in you raising capital.
        </p>
      </Clause>

      <Clause n={12} title="Limitation of liability">
        <p>
          To the fullest extent permitted by law, JM Solutions will not be liable for indirect,
          incidental, special, consequential, or punitive damages, or for lost profits, lost
          investment opportunity, or lost data.
        </p>
        <p>
          Our total aggregate liability arising out of or relating to the service will not exceed the
          greater of (a) the fees you paid us in the twelve months before the event giving rise to
          the claim, or (b) one hundred United States dollars.
        </p>
        <p>
          Some jurisdictions do not allow certain limitations. Where that is so, the limitations
          above apply to the maximum extent permitted.
        </p>
      </Clause>

      <Clause n={13} title="Indemnity">
        <p>
          You will indemnify JM Solutions against claims, damages, and reasonable costs arising from
          your content, your use of the service, or your breach of these Terms.
        </p>
      </Clause>

      <Clause n={14} title="Changes to these Terms">
        <p>
          We may update these Terms. If a change is material, we will give notice in the app or by
          email before it takes effect. Continuing to use the service after that means you accept the
          updated Terms. The version number and effective date at the top of this page always tell
          you which version is current.
        </p>
      </Clause>

      <Clause n={15} title="Governing law">
        <p>
          These Terms are governed by the laws of the State of Kansas, without regard to its conflict
          of laws rules. The state and federal courts located in Kansas have exclusive jurisdiction
          over any dispute arising out of these Terms, and both parties consent to that venue.
        </p>
      </Clause>

      <Clause n={16} title="Contact">
        <p>
          JM Solutions
          <br />
          hello@dealstudio.io
        </p>
      </Clause>
    </LegalPage>
  );
}
