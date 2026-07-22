"use client";

import { useRouter } from "next/navigation";
import { AddEntryDialog } from "@/components/add-entry-dialog";

export default function AddPage() {
  const router = useRouter();

  return (
    <main className="mx-auto min-h-screen max-w-app px-4 py-6 pb-28 sm:px-8 lg:px-12 lg:py-10">
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
    </main>
  );
}
