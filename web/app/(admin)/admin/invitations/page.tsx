import { PageHeader, PageShell } from "@/components/ui";
import { InvitationsPanel } from "@/components/admin/invitations-panel";

export default function AdminInvitationsPage() {
  return (
    <PageShell>
      <div className="workspaceStack">
        <PageHeader
          eyebrow="System administration"
          title="Invitations"
          subtitle="Invite someone to the beta by email. Each invitation grants its own stretch of premium, counted from the day it is accepted rather than the day you send it."
        />
        <InvitationsPanel />
      </div>
    </PageShell>
  );
}
