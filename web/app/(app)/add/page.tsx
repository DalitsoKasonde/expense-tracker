"use client";

import { useRouter } from "next/navigation";
import { AddEntryDialog } from "@/components/add-entry-dialog";
import { PageShell } from "@/components/ui";

export default function AddPage() {
  const router = useRouter();

  return (
    <PageShell>
      <AddEntryDialog
        open
        onClose={() => {
          if (window.history.length > 1) {
            router.back();
            return;
          }
          router.push("/today");
        }}
      />
    </PageShell>
  );
}
