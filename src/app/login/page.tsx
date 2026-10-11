import { loadAppSettings } from "@/lib/app-settings";
import LoginForm from "@/components/LoginForm";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return <LoginForm appName={loadAppSettings().appName} />;
}
