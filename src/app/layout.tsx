import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = { title: "KCMSC | Employee Management", description: "Employee profiles, approvals and employees directory" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
