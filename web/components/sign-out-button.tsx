"use client";

import { signOutEverywhere } from "@/lib/browser-auth";

type SignOutButtonProps = {
  className?: string;
};

export function SignOutButton({ className = "ghostButton" }: SignOutButtonProps) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        void signOutEverywhere();
      }}
    >
      Log out
    </button>
  );
}
