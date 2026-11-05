import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Collectly — Invoice & Collections for Indian Freelancers",
  description: "Create invoices, track payments, and get paid faster.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans bg-gray-50 text-gray-900">{children}</body>
    </html>
  );
}
