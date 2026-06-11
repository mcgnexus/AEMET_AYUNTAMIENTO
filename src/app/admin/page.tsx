import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, verifyAdminSession } from "@/lib/adminAuth";
import { AdminConsole } from "@/components/AdminConsole";

export default async function AdminPage() {
  const cookieStore = await cookies();
  if (!verifyAdminSession(cookieStore.get(ADMIN_COOKIE)?.value)) {
    redirect("/admin/login");
  }
  return <AdminConsole />;
}
