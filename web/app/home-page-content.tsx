import type { ReactNode } from "react";
import Link from "next/link";
import { Brand } from "@/components/brand";

/**
 * The public face of the product.
 *
 * This is deliberately reachable without a session. Google's OAuth review
 * rejects a homepage that sits behind a login, and a person deciding whether to
 * hand over their financial records should be able to read what the app does,
 * and what it asks for, before creating an account.
 */
export function HomePageContent() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-6">
        <Brand priority />
        <nav className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <Link className="font-semibold text-on-surface-soft hover:underline" href="/privacy">Privacy Policy</Link>
          <Link className="font-semibold text-accent hover:underline" href="/login">Sign in</Link>
          <Link className={"btn btn-primary btn-sm"} href="/register">Create an account</Link>
        </nav>
      </header>

      <main className="mx-auto grid w-full max-w-5xl gap-12 px-4 pb-16">
        <section className="grid gap-5 pt-6">
          <p className="text-sm font-semibold uppercase tracking-wider text-primary">
            Personal finance, built for Zambia
          </p>
          <h1 className="max-w-3xl text-4xl font-semibold leading-tight text-on-surface sm:text-5xl">
            Know where every kwacha went, and what it left behind.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-on-surface-soft">
            Inscribed Expenses is a personal money tracker for everyday Zambian finances. It records what
            you earn and spend across bank accounts, mobile money and cash, then shows you the position
            that follows from it — what you own, what you owe, and whether this month moved you forward.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Link className="btn btn-primary" href="/register">Create an account</Link>
            <Link className="btn btn-ghost" href="/login">Sign in</Link>
          </div>
          <p className="text-sm text-on-surface-soft">
            Free to use. Amounts are kept in Zambian kwacha by default, with other currencies available
            per account.
          </p>
        </section>

        <Section
          title="What you can do with it"
          lead="Everything below is part of the app; there is no separate paid tier."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Feature title="Track daily money">
              Record income and expenses against bank accounts, Airtel and MTN mobile money wallets, and
              cash. Mobile money charges are recorded as their own linked entry, so a balance matches the
              SMS alert rather than drifting from it.
            </Feature>
            <Feature title="See the month honestly">
              Reports break down earned versus borrowed income, living costs, debt payments, savings and
              investments, and flag the months where free cash flow turned negative.
            </Feature>
            <Feature title="Set goals and savings pockets">
              Put money aside for a named purpose and watch the balance build, including interest earned
              on a savings pocket.
            </Feature>
            <Feature title="Follow debts in both directions">
              Track loans you have taken and money you have lent, with principal, interest and fees kept
              apart so you can see the real cost of borrowing.
            </Feature>
            <Feature title="Run a savings group">
              Record contributions, payouts and group loans for a chilimba or village banking circle, and
              close a cycle with a share-out.
            </Feature>
            <Feature title="Hold investments">
              Follow LuSE-listed shares and Zambian government bonds, with dividends received and coupons
              paid counted as the return they actually are.
            </Feature>
            <Feature title="Bring in past records">
              Import an existing spreadsheet of transactions, map its columns once, and undo the whole
              import if the mapping was wrong.
            </Feature>
            <Feature title="Get summaries by email">
              Ask for a daily, weekly or monthly summary of what needs attention, choose which alerts are
              worth an email, and email yourself a yearly statement as a spreadsheet.
            </Feature>
            <Feature title="Use it offline">
              Install it to your phone&rsquo;s home screen. Entries made without a signal are queued and sync
              when you are back online.
            </Feature>
          </div>
        </Section>

        <Section
          title="How you sign in"
          lead="Three ways in, so a forgotten password never locks you out of your own records."
        >
          <ul className="grid gap-3">
            <Bullet><strong className="text-on-surface">Email and password.</strong> The ordinary way, with a reset link if you forget it.</Bullet>
            <Bullet><strong className="text-on-surface">A six-digit code by email.</strong> We email a code that works once and expires in ten minutes.</Bullet>
            <Bullet><strong className="text-on-surface">Continue with Google.</strong> Use a Google account you already have, with no extra password to remember.</Bullet>
          </ul>
        </Section>

        <Section
          title="Why we ask for your data"
          lead="The short version: we ask for what signing you in and showing you your own money requires, and nothing beyond it."
        >
          <div className="grid gap-4">
            <Panel title="If you choose “Continue with Google”">
              <p>
                Google gives us four things: your Google account identifier, your name, your email
                address, and whether Google has confirmed that address. We use them for one purpose —
                to create or find your Inscribed Expenses account and sign you in. Your name is what the
                app greets you with; your email is where password resets and any summaries you ask for
                are sent.
              </p>
              <p>
                <strong className="text-on-surface">
                  We do not request access to Gmail, Google Drive, your contacts, your calendar, or your
                  Google payment information.
                </strong>{" "}
                We do not use anything received from Google for advertising, and we do not sell it. Our
                use of information received from Google APIs follows the{" "}
                <a href="https://developers.google.com/terms/api-services-user-data-policy" rel="noreferrer" target="_blank">
                  Google API Services User Data Policy
                </a>, including its Limited Use requirements.
              </p>
              <p>
                Google sign-in is optional. Email and password works just as well, and you can revoke our
                access at any time in your Google Account permissions.
              </p>
            </Panel>

            <Panel title="The financial information you enter">
              <p>
                Accounts, balances, transactions, debts, savings, goals and investments are stored so the
                app can show them back to you and calculate your reports. That is the product; it does
                not leave your account and it is not sold or shared with advertisers.
              </p>
              <p>
                We never ask for your bank password and we do not connect to your bank. Everything comes
                from what you enter or import yourself.
              </p>
            </Panel>

            <Panel title="Keeping the account safe">
              <p>
                We record the technical minimum that running a service securely requires: hashed
                passwords, session cookies, sign-in history, error logs, and the IP addresses used for
                rate limiting. Connections use HTTPS and backups are encrypted.
              </p>
            </Panel>
          </div>

          <p className="text-on-surface-soft">
            The full detail — retention, your rights, who processes what, and how to have your
            information deleted — is in the{" "}
            <Link className="font-semibold text-primary underline" href="/privacy">Privacy Policy</Link>.
          </p>
        </Section>

        <Section title="Who runs it">
          <p className="leading-7 text-on-surface-soft">
            Inscribed Expenses is operated by Inscribed, based in Lusaka, Zambia. For questions about the
            app or your information, write to{" "}
            <a href="mailto:myjourneyintech@gmail.com">myjourneyintech@gmail.com</a>.
          </p>
        </Section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-on-surface-soft">
          <span>© {new Date().getFullYear()} Inscribed · Lusaka, Zambia</span>
          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <Link className="font-semibold text-primary hover:underline" href="/privacy">Privacy Policy</Link>
            <Link className="font-semibold text-primary hover:underline" href="/login">Sign in</Link>
            <Link className="font-semibold text-primary hover:underline" href="/register">Create an account</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function Section({ title, lead, children }: { title: string; lead?: string; children: ReactNode }) {
  return (
    <section className="grid gap-5">
      <div className="grid gap-2">
        <h2 className="text-2xl font-semibold text-on-surface sm:text-3xl">{title}</h2>
        {lead ? <p className="max-w-2xl leading-7 text-on-surface-soft">{lead}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Feature({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card card-pad grid content-start gap-2">
      <h3 className="text-base font-semibold text-on-surface">{title}</h3>
      <p className="text-sm leading-6 text-on-surface-soft">{children}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="card card-pad grid gap-3 text-on-surface-soft [&_a]:font-semibold [&_a]:text-primary [&_a]:underline [&_p]:leading-7">
      <h3 className="text-base font-semibold text-on-surface">{title}</h3>
      {children}
    </div>
  );
}

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="card card-pad text-on-surface-soft">
      <span className="text-sm leading-6">{children}</span>
    </li>
  );
}
