import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Poach Studio",
  description: "Copy and photos in, approved posts out.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
