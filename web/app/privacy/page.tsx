import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import { Brand } from "@/components/brand";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Inscribed Expenses collects, uses, stores, and protects personal information.",
};

const effectiveDate = "12 September 2026";

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-dvh bg-background px-4 py-10 sm:py-16">
      <article className="mx-auto grid w-full max-w-3xl gap-8 rounded-2xl border border-border bg-surface p-6 shadow-sm sm:p-10">
        <header className="grid gap-5 border-b border-border pb-8">
          <Link href="/" aria-label="Return to Inscribed Expenses"><Brand /></Link>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">Legal</p>
            <h1 className="mt-2 text-3xl font-semibold text-on-surface sm:text-4xl">Privacy Policy</h1>
            <p className="mt-3 text-sm text-on-surface-soft">Effective {effectiveDate}</p>
          </div>
          <p className="leading-7 text-on-surface-soft">
            This policy explains how Inscribed, the operator of Inscribed Expenses, collects, uses,
            stores, and shares personal information when you use the service. Inscribed is based in
            Lusaka, Zambia and is responsible for the personal information described here.
          </p>
        </header>

        <PolicySection title="Information we collect">
          <p>We collect information you provide or generate while using Inscribed Expenses:</p>
          <ul>
            <li><strong>Account information:</strong> your name, email address, password hash, account role, verification status, and sign-in history.</li>
            <li><strong>Financial information:</strong> accounts, balances, transactions, income, expenses, debts, savings, goals, investments, imported records, and reports you choose to enter.</li>
            <li><strong>Preferences and communications:</strong> display preferences, email-summary choices, feedback, and records of emails the service attempts to deliver.</li>
            <li><strong>Technical information:</strong> request identifiers, IP addresses used for security and rate limiting, error logs, device or browser information supplied with web requests, and session-cookie data.</li>
          </ul>
          <p>We do not collect bank passwords or automatically connect to your bank accounts.</p>
        </PolicySection>

        <PolicySection title="Google sign-in">
          <p>
            If you choose “Continue with Google,” Google provides your Google account identifier,
            name, email address, and whether Google has verified that address. We use this information
            only to create or locate your Inscribed Expenses account, confirm your email, and sign you in.
          </p>
          <p>
            Inscribed Expenses does not request access to Gmail, Google Drive, contacts, calendars,
            payment information, or other content in your Google account. We do not use Google sign-in
            information for advertising or sell it to third parties.
          </p>
          <p>
            Our use and transfer of information received from Google APIs follows the{" "}
            <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noreferrer" target="_blank">
              Google API Services User Data Policy
            </a>, including its Limited Use requirements.
          </p>
        </PolicySection>

        <PolicySection title="How we use information">
          <p>We use personal information to:</p>
          <ul>
            <li>provide the expense tracking, reporting, planning, savings, debt, and investment features you request;</li>
            <li>authenticate you by password, Google sign-in, or a single-use email code;</li>
            <li>send requested password resets, verification messages, statements, and optional financial summaries;</li>
            <li>protect accounts, prevent abuse, diagnose failures, maintain backups, and improve service reliability;</li>
            <li>respond to feedback and comply with applicable legal obligations.</li>
          </ul>
        </PolicySection>

        <PolicySection title="When we share information">
          <p>
            We disclose information only to service providers needed to operate Inscribed Expenses,
            such as cloud hosting, database and backup infrastructure, transactional email delivery,
            and Google when you choose Google sign-in. These providers process information under their
            own contractual and security obligations.
          </p>
          <p>
            We may also disclose information when required by law, to protect users or the service, or
            as part of a business transfer with appropriate notice and safeguards. We do not sell personal
            information or share financial records with advertisers.
          </p>
        </PolicySection>

        <PolicySection title="Cookies and sessions">
          <p>
            The service uses essential, secure session cookies and tokens to keep you signed in, protect
            authenticated requests, remember your chosen appearance, and support the installed web app.
            Inscribed Expenses does not use third-party advertising cookies.
          </p>
        </PolicySection>

        <PolicySection title="Storage, international processing, and retention">
          <p>
            Information is stored in access-controlled production systems and encrypted backups. Some
            service providers may process information outside Zambia. We select providers and safeguards
            intended to protect information wherever it is processed.
          </p>
          <p>
            We retain account and financial information while your account is active and for as long as
            reasonably needed to provide the service, meet legal obligations, resolve disputes, and protect
            the service. When information is deleted, limited copies may remain temporarily in encrypted
            backups until those backups are replaced or securely removed.
          </p>
        </PolicySection>

        <PolicySection title="Security">
          <p>
            We use measures including encrypted HTTPS connections, hashed passwords, short-lived and
            single-use authentication codes, access controls, rate limits, network-restricted databases,
            and encrypted backups. No online service can guarantee absolute security, so please use a
            unique password and protect access to your email and Google accounts.
          </p>
        </PolicySection>

        <PolicySection title="Your choices and rights">
          <p>
            You may review and correct information in the service, turn optional email summaries off,
            use password sign-in instead of Google, and ask us to provide, correct, restrict, or delete
            personal information associated with your account. You may also object to or withdraw consent
            from optional processing where applicable. Some information may be retained when required by law.
          </p>
          <p>
            You may revoke Inscribed Expenses in your Google Account permissions. Revoking Google access
            prevents future Google sign-in but does not automatically delete your Inscribed Expenses account;
            contact us to request account deletion.
          </p>
        </PolicySection>

        <PolicySection title="Children">
          <p>
            Inscribed Expenses is not directed to children and we do not knowingly collect a child’s
            personal information without the consent or other legal basis required by applicable law.
          </p>
        </PolicySection>

        <PolicySection title="Changes to this policy">
          <p>
            We may update this policy when the service or legal requirements change. We will publish the
            revised policy here, update its effective date, and provide additional notice when a material
            change affects how we use personal information.
          </p>
        </PolicySection>

        <PolicySection title="Contact and complaints">
          <p>
            For privacy questions or requests, contact Inscribed at{" "}
            <a href="mailto:myjourneyintech@gmail.com">myjourneyintech@gmail.com</a>. Please do not include
            passwords, email codes, or detailed financial records in your message.
          </p>
          <p>
            You may also raise a concern with Zambia’s{" "}
            <a href="https://www.dataprotection.gov.zm/" rel="noreferrer" target="_blank">Data Protection Commission</a>.
          </p>
        </PolicySection>

        <footer className="flex flex-wrap gap-4 border-t border-border pt-6 text-sm">
          <Link className="font-semibold text-primary hover:underline" href="/login">Sign in</Link>
          <Link className="font-semibold text-primary hover:underline" href="/register">Create an account</Link>
        </footer>
      </article>
    </main>
  );
}

function PolicySection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 text-on-surface-soft [&_a]:font-semibold [&_a]:text-primary [&_a]:underline [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_li]:leading-7 [&_p]:leading-7">
      <h2 className="text-xl font-semibold text-on-surface">{title}</h2>
      {children}
    </section>
  );
}
