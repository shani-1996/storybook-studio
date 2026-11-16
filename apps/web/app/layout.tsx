import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "../components/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Personalised storybooks",
  description: "A storybook starring your child. Coming soon.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
