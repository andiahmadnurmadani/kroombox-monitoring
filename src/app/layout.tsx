import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Uptime Monitor",
  description: "Dashboard monitoring status website",
};

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
