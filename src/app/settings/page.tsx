import { redirect } from "next/navigation";
import { isAuthenticated, getUsername } from "@/lib/auth";
import SettingsForm from "@/components/SettingsForm";

export default async function SettingsPage() {
  if (!(await isAuthenticated())) {
    redirect("/login");
  }
  return <SettingsForm currentUsername={getUsername()} />;
}
