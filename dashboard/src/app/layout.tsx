import "./globals.css";
import { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";

export const metadata = {
  title: "HOPE Dashboard",
  description: "Operator dashboard"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
