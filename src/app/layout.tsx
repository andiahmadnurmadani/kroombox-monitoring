import type { Metadata } from "next";
import "./globals.css";
import { loadAppSettings } from "@/lib/app-settings";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: loadAppSettings().appName,
    description: "Dashboard monitoring website, server, dan NAS",
    icons: { icon: "/branding/logo", apple: "/branding/logo" },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" className="dark">
      <body className="antialiased">{children}</body>
    </html>
  );
}
