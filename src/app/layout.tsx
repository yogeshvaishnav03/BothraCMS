import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Build Track Pro — Construction & Site Operations Management",
  description: "Enterprise Construction Project, Site Operations & Financial Management Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 flex flex-col">{children}</body>
    </html>
  );
}
