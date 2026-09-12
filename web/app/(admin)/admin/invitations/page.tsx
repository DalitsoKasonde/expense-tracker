import { PageHeader, PageShell } from "@/components/ui";
import { InvitationsPanel } from "@/components/admin/invitations-panel";

export default function AdminInvitationsPage() {
  return (
    <PageShell>
      <div className="workspaceStack">
        <PageHeader
          eyebrow="System administration"
          title="Invitations"
          subtitle="Invite someone to the beta by email. They set their own password, and the premium months you choose start the moment they accept."
        />
        <InvitationsPanel />
      </div>
    </PageShell>
  );
}
