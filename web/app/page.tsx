import { getAuthSession } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await getAuthSession();

  if (session?.user) {
    redirect("/today");
  }

  redirect("/login");
}
