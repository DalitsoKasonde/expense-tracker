import type { Route } from "next";

/** The administration workspaces, in the order an operator actually needs them.
 *  The nav and the overview read from this one list, so a workspace can never
 *  again exist as a page nobody can navigate to. */
export const adminSections = [
  {
    href: "/admin" as Route,
    label: "Overview",
    shortLabel: "Overview",
    description: "What needs your attention today, and where to go for it.",
  },
  {
    href: "/admin/users" as Route,
    label: "People",
    shortLabel: "People",
    description: "Find an account, change what it can use, suspend or restore access.",
  },
  {
    href: "/admin/invitations" as Route,
    label: "Invitations",
    shortLabel: "Invites",
    description: "Invite someone to the beta by email and see who has accepted.",
  },
  {
    href: "/admin/feedback" as Route,
    label: "Feedback",
    shortLabel: "Feedback",
    description: "Notes people sent from inside the app, newest first.",
  },
  {
    href: "/admin/backups" as Route,
    label: "Backups",
    shortLabel: "Backups",
    description: "Request an encrypted database backup and check that it finished.",
  },
  {
    href: "/admin/administrators" as Route,
    label: "Administrators",
    shortLabel: "Admins",
    description: "Give another person access to this console.",
  },
  {
    href: "/admin/audit" as Route,
    label: "Audit trail",
    shortLabel: "Audit",
    description: "Every administrative action taken here, with a timestamp.",
  },
] as const;

export type AdminSection = (typeof adminSections)[number];
