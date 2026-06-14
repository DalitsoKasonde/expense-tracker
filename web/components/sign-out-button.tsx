"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      className="ghostButton"
      onClick={() => signOut({ callbackUrl: "/login" })}
    >
      Log out
    </button>
  );
}

