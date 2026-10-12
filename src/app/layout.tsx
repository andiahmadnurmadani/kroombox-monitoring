import type { Metadata } from "next";
import "./globals.css";
import { loadAppSettings } from "@/lib/app-settings";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: loadAppSettings().appName,
    description: "Monitoring dashboard for websites, servers and NAS",
    icons: { icon: "/branding/logo", apple: "/branding/logo" },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
