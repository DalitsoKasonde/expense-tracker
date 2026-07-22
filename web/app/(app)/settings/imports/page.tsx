"use client";

import Link from "next/link";

export default function ImportSettingsPage() {
  return (
    <section className="settingsSection">
      <div className="grid gap-6">
        <div className="card settingsListPanel">
          <div className="settingsHeaderRow">
            <strong>Bring in old data</strong>
          </div>
          <div className="grid gap-4 pt-4">
            <p className="muted">
              Import your legacy Excel workbooks to bring transaction history into the app. The importer can also create missing categories and income sources from those files.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-outline bg-surface-soft p-4">
                <strong className="block text-on-surface">What gets created</strong>
                <p className="mt-2 text-sm text-on-surface-soft">
                  Transactions, expense categories, and income sources are created automatically when they do not already exist.
                </p>
              </div>
              <div className="rounded-lg border border-outline bg-surface-soft p-4">
                <strong className="block text-on-surface">What you choose</strong>
                <p className="mt-2 text-sm text-on-surface-soft">
                  Pick the account that imported cashflow should land in, then upload one or more yearly workbooks in one batch.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/import/new" className="primaryButton">
                Start import
              </Link>
              <Link href="/import" className="ghostButton">
                View import history
              </Link>
            </div>
          </div>
        </div>

        <div className="card settingsListPanel">
          <div className="settingsHeaderRow">
            <strong>Important notes</strong>
          </div>
          <div className="grid gap-3 pt-4 text-sm text-on-surface-soft">
            <p>
              Legacy workbook imports preserve the month and entry order from the sheet. If the source workbook does not store exact transaction dates, the imported date is approximate within that month.
            </p>
            <p>
              Debt, creditor, and investment summary tabs are not rebuilt into full loan or portfolio structures in this first pass. Those sheets remain useful as source context, but the import focuses on history, categories, and income sources.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
