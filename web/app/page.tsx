import { getAuthSession } from "@/lib/auth";
import { hasVerifiedSession } from "@/lib/verified-session";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await getAuthSession();

  if (await hasVerifiedSession(session)) {
    if (session?.user?.role === "system_admin") {
      redirect("/admin");
    }
    redirect("/today");
  }

  redirect("/login");
}
