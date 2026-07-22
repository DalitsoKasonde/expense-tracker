import type { Route } from "next";
import { redirect } from "next/navigation";

export default function SettingsLoansRedirect() {
  redirect("/loans" as Route);
}
