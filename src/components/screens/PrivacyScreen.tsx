/**
 * Privacy Policy. Version 1.0, first execution.
 *
 * NOT LEGAL ADVICE. Written to describe what the system ACTUALLY does today,
 * including where it falls short, because a privacy policy that overstates is
 * worse than none: it is a written promise you can be held to.
 *
 * Known gap reflected below: deleting an organization cascades through the
 * database, but files in Supabase Storage are not removed automatically. The
 * deletion clause therefore says deletion happens on request within 30 days,
 * which is true only if the storage bucket is purged by hand. Fix the automatic
 * path and this clause becomes safe without manual work.
 */

import { LegalPage, Clause } from './LegalPage';

export function PrivacyScreen() {
  return (
    <LegalPage title="Privacy Policy" version="Version 1.0" effective="July 12, 2026">
      <p className="text-sm leading-relaxed text-[#4b5563] mb-7">
        This policy explains what DealStudio, operated by JM Solutions ("we", "us"), collects, why,
        and what we do with it. DealStudio is an investor deal room service. Two different groups of
        people appear in this policy: <strong className="text-[#191f1d]">customers</strong>, who are
        founders with an account, and <strong className="text-[#191f1d]">investors</strong>, who
        visit a deal room a customer has shared with them.
      </p>

      <Clause n={1} title="What we collect from customers">
        <ul className="list-disc pl-5 space-y-1">
          <li><strong className="text-[#191f1d]">Account data.</strong> Name, email address, company name, and the password hash for your login.</li>
          <li><strong className="text-[#191f1d]">Content you upload.</strong> Pitch decks, documents, financial figures, team details, and anything else you enter into a deal room.</li>
          <li><strong className="text-[#191f1d]">Billing data.</strong> Your plan, subscription status, and any add-ons. Card details are handled by our payment processor and never reach our servers.</li>
          <li><strong className="text-[#191f1d]">Support correspondence.</strong> What you send us when you ask for help.</li>
        </ul>
      </Clause>

      <Clause n={2} title="What we collect from deal room visitors">
        <p>When an investor opens a deal room, we record:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>The email address they enter at the access gate, where the room requires one.</li>
          <li>Which pages and documents they opened, and how long they spent.</li>
          <li>The number of times they returned.</li>
        </ul>
        <p>
          This is the core of the product: the customer who owns the deal room is shown this activity
          so they know which investors are engaged. Investors should understand that visiting a deal
          room is not anonymous to the founder who shared it.
        </p>
        <p>
          <strong className="text-[#191f1d]">The customer, not JM Solutions, decides what to do with
          this information.</strong> For that data we act on the customer's instructions. If you are
          an investor and want your activity removed, contact the company whose room you visited, or
          us at hello@dealstudio.io and we will pass the request on.
        </p>
      </Clause>

      <Clause n={3} title="How we use it">
        <ul className="list-disc pl-5 space-y-1">
          <li>To run the service: show your deal room to people you have authorised, and show you their activity.</li>
          <li>To authenticate you and keep accounts separate.</li>
          <li>To bill you, if you are on a paid plan.</li>
          <li>To answer support requests.</li>
          <li>To keep the service secure and investigate abuse.</li>
        </ul>
        <p>
          <strong className="text-[#191f1d]">We do not sell personal data. We do not use your content
          or your investors' data to train machine learning models. We do not serve advertising.</strong>
        </p>
      </Clause>

      <Clause n={4} title="Who we share it with">
        <p>We use a small number of processors, and only these:</p>
        <ul className="list-disc pl-5 space-y-1">
          <li><strong className="text-[#191f1d]">Supabase</strong> for our database, authentication, and file storage. Supabase is SOC 2 Type 2 compliant and ISO 27001 certified.</li>
          <li><strong className="text-[#191f1d]">Vercel</strong> for application hosting. Vercel holds a SOC 2 Type 2 attestation for security, confidentiality, and availability.</li>
          <li><strong className="text-[#191f1d]">Resend</strong> for transactional email, such as meeting requests and invitations.</li>
          <li><strong className="text-[#191f1d]">Stripe</strong> for payment processing, once paid subscriptions are enabled. Stripe handles card details directly. We never see or store your card number.</li>
        </ul>
        <p>
          We will also disclose data where we are legally compelled to, and we will tell you unless we
          are prohibited from doing so.
        </p>
      </Clause>

      <Clause n={5} title="Security">
        <p>
          Data is encrypted in transit using TLS and at rest using AES-256, provided by our
          infrastructure. Every table in our database enforces row-level security, so one customer's
          organization cannot read another's data, and that isolation is enforced by the database
          itself rather than by application code alone.
        </p>
        <p>
          A shared deal room password, where you set one, is stored so that you can retrieve it and
          give it to investors. It is never included in any response sent to a deal room visitor.
        </p>
        <p>
          No system is perfectly secure. We do not claim to hold SOC 2 certification ourselves; our
          infrastructure providers do, which is a different thing, and we would rather say so plainly
          than imply otherwise.
        </p>
      </Clause>

      <Clause n={6} title="Cookies and local storage">
        <p>
          We use browser storage for things the service cannot work without: keeping you signed in,
          and remembering that an investor has already passed a deal room's access gate so they are
          not asked twice. We do not use advertising or cross-site tracking cookies.
        </p>
      </Clause>

      <Clause n={7} title="Retention and deletion">
        <p>
          We keep your data for as long as your account is open.
        </p>
        <p>
          You may ask us to delete your account and its data by writing to hello@dealstudio.io. We
          will action the request within 30 days. Deleting an organization removes its deal rooms,
          documents, investor records, and visit history, and we will remove your uploaded files from
          storage.
        </p>
        <p>
          We retain billing and transaction records where we are required to for tax and accounting
          purposes, even after an account is closed.
        </p>
      </Clause>

      <Clause n={8} title="Your rights">
        <p>
          Depending on where you live, you may have the right to access, correct, export, or delete
          your personal data, and to object to certain processing. Write to hello@dealstudio.io and we
          will respond within 30 days.
        </p>
        <p>
          If you are an investor whose activity was recorded in a deal room, the founder who owns that
          room controls that data. See section 2.
        </p>
      </Clause>

      <Clause n={9} title="Children">
        <p>
          DealStudio is not intended for anyone under 18 and we do not knowingly collect data from
          children.
        </p>
      </Clause>

      <Clause n={10} title="International transfers">
        <p>
          Our infrastructure is hosted in the United States. If you use DealStudio from elsewhere,
          your data will be transferred to and processed in the United States.
        </p>
      </Clause>

      <Clause n={11} title="Changes to this policy">
        <p>
          If we change this policy materially, we will give notice in the app or by email before the
          change takes effect. The version number and effective date at the top of this page always
          tell you which version is current.
        </p>
      </Clause>

      <Clause n={12} title="Contact">
        <p>
          JM Solutions
          <br />
          hello@dealstudio.io
        </p>
      </Clause>
    </LegalPage>
  );
}
