import type { Metadata } from "next";
import "./globals.css";
import "./studio.css";
import "./site.css";

export const metadata: Metadata = {
  verification: {google: 'wYgrqDZWC5-fRH5atkoAodW-8BLRvAieqtVmf8uPIZo'},
  title: "Scopio — Every request. Clearly agreed.",
  description: "Keep your projects moving and your scope clear. Capture feedback, review changes, and get agreement in one workspace.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
