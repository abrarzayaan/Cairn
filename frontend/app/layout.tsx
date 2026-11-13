import type { Metadata } from "next";
import Navbar from "@/components/Navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "devbook",
  description: "Linked notes for developers. Write what you learn. Link what depends on what.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="flex min-h-screen flex-col bg-bg text-text antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-text focus:px-3 focus:py-2 focus:text-xs focus:text-bg"
        >
          Skip to content
        </a>
        <Navbar />
        <main id="main-content" className="mx-auto w-full max-w-4xl flex-1 px-4 py-8">
          {children}
        </main>
        <footer className="flex items-center justify-between border-t border-border px-4 py-4 text-xs text-text-muted">
          <div>devbook &middot; Linked notes for developers</div>
          <div className="flex gap-3">
            <a href="/about" className="hover:text-text">About</a>
            <a href="/terms" className="hover:text-text">Terms</a>
            <a href="/privacy" className="hover:text-text">Privacy</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
