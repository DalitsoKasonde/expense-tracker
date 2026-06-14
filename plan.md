Absolutely. I’d make it a **mobile-first PWA**, so you can open it from your phone, add it to your home screen, and update expenses/investments in under 10 seconds.

Next.js officially supports PWA-style apps with a manifest, home-screen install, push notifications, and service workers, so this fits well with Next.js 16. Source: [Next.js PWA guide](https://nextjs.org/docs/app/guides/progressive-web-apps).

**Mobile-First Strategy**
The main app should have a bottom navigation, like a banking app:

- **Today**
- **Add**
- **Investments**
- **Reports**
- **Settings**

The center action is always **Add**, because daily input is the most important habit.

**Phone Entry Flow**
On mobile, the form should be one-handed:

1. Tap `+`
2. Enter amount: `K 120`
3. Pick type: `Expense`, `Income`, `Saving`, `Investment`
4. Pick category: `Groceries`, `Airtime`, `Patuma`, `LuSE Stock`, etc.
5. Optional note
6. Save

For investment entries, the form expands only when needed:
- Stock buy: shares, price, fees
- Dividend: asset, amount
- Bond coupon: bond, amount
- Savings group: group name, contribution/payoff
- Patuma: pocket, deposit/withdrawal

No big spreadsheet view on the phone by default. Just simple cards.

**PWA Features**
Build it so you can:

- Install it on your phone home screen
- Use it on iPhone or Android without app store approval
- Add transactions quickly
- See cached summaries even with weak internet
- Queue entries offline and sync later
- Receive reminders like “Log today’s spending”
- Use biometric/device login where possible

**Architecture**
Keep the stack like this:

- `Next.js 16`: mobile UI, dashboards, forms, PWA shell
- `Go API`: transactions, investment calculations, reports
- `PostgreSQL`: source of truth
- Local browser storage: temporary offline queue
- Background sync: send queued entries to Go API when online

**Best UX Rule**
The phone app should never ask you to understand accounting.

Use friendly labels:
- `Money I received`
- `Money I spent`
- `Money I saved`
- `Money I invested`
- `Investment income`

Then the backend maps those into proper transaction types.

**MVP Mobile Screens**
1. **Today**
   - This month’s balance
   - Today’s spending
   - Recent entries
   - Big `Add Entry` button

2. **Quick Add**
   - Large amount keypad
   - Category chips
   - Save button fixed at bottom

3. **Investments**
   - Total portfolio value
   - Stocks
   - Bonds
   - Savings groups
   - Patuma pockets

4. **Reports**
   - Month summary
   - Spending by category
   - Savings rate
   - Investment contributions

5. **Settings**
   - Categories
   - Assets
   - Recurring entries
   - Export to Excel

The key idea: **desktop can be detailed, mobile should be fast.**

Yes. Excel import should be a core feature, especially because you already have your 2025 workbook.

**Excel Import Strategy**
Add an **Import Excel** flow with two modes:

**1. Guided Import**
Best for your existing monthly spreadsheets.

Flow:
1. Upload `.xlsx`
2. App detects sheets like `JANUARY`, `FEBRUARY`, etc.
3. Preview detected rows:
   - Income
   - Expenses
   - Savings
   - Investments
4. You confirm category mapping
5. App imports entries into the daily transaction ledger

This is best for messy or personal spreadsheets.

**2. Template Import**
Best going forward.

The app provides a clean Excel template with columns:
- `Date`
- `Type`
- `Asset / Area`
- `Category`
- `Description`
- `Amount`
- `Units`
- `Unit Price`
- `Fees`
- `Notes`

If the uploaded Excel matches this format, import is almost automatic.

**Backend Design**
Use Go for import processing:

- `POST /imports/excel`
- `GET /imports/{id}/preview`
- `POST /imports/{id}/confirm`
- `GET /imports/{id}/errors`

Import pipeline:
1. Upload file
2. Store original file
3. Parse workbook
4. Detect layout
5. Normalize rows into transactions
6. Show preview
7. Confirm and write to database

**Go Libraries**
Use:
- `excelize` for `.xlsx` parsing
- PostgreSQL for storing imports and parsed transactions
- Background job for larger files

**Important Import Tables**
- `imports`
- `import_rows`
- `import_mappings`
- `transactions`

Keep every imported row traceable, so you can audit or undo an import.

**Smart Mapping**
For your current spreadsheet style, the app can map rows like:

- `NET SALARY` → Income / Salary
- `PROJECTS` → Income / Projects
- `GROCERIES` → Expense / Groceries
- `AIRTIM` or `AIRTIME` → Expense / Airtime
- `DEBT REPAYMENT` → Expense / Debt Repayment
- `PERSONAL DEVELOPMENT` → Expense / Personal Development
- `DIVIDEND` → Investment Income
- `BOND COUPON` → Investment Income

**Undo Matters**
Every import should create an import batch ID. Then you can click:

`Undo Import`

That deletes only transactions created by that import batch. This will save you from anxiety when importing old files.