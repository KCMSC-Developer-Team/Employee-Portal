import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "KCMSC Staff Portal", template: "%s · KCMSC Staff Portal" },
  description: "Secure staff records, employee self-service and approved change management for K C Model School & College.",
  icons: { icon: "/icon.svg", shortcut: "/icon.svg" },
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
