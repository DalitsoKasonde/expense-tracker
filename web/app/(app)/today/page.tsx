export default function TodayPage() {
  return (
    <>
      <section className="heroCard">
        <span className="eyebrow">Today</span>
        <h1 className="pageTitle">Fast entry, clean balances, and room for business cash flow.</h1>
        <p className="lede">
          Phase 0 gives us a working shell: auth, navigation, PWA installability, and a database-backed foundation.
        </p>
        <div className="statsGrid">
          <div className="statCard">
            <span className="muted">Accounts tracked</span>
            <strong>0</strong>
          </div>
          <div className="statCard">
            <span className="muted">Businesses linked</span>
            <strong>0</strong>
          </div>
        </div>
      </section>

      <section className="surfaceCard">
        <h2>Foundation checklist</h2>
        <div className="pillList">
          <span className="pill">NextAuth invite-only login</span>
          <span className="pill">JWT API middleware</span>
          <span className="pill">12 SQL migrations</span>
          <span className="pill">PWA shell</span>
        </div>
      </section>
    </>
  );
}

