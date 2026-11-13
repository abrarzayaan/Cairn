import type { Metadata } from "next";
import { cookies } from "next/headers";
import {
  IBM_Plex_Mono,
  IBM_Plex_Sans,
  Noto_Sans_Bengali,
  Source_Serif_4,
} from "next/font/google";
import Navbar from "@/components/Navbar";
import "./globals.css";

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-plex-sans",
  display: "swap",
});

const sourceSerif = Source_Serif_4({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-source-serif",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-mono",
  display: "swap",
});

const notoBengali = Noto_Sans_Bengali({
  subsets: ["bengali"],
  weight: ["400", "500", "600"],
  variable: "--font-bengali",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cairn",
  description:
    "Linked notes for developers. Write what you learn. Link what depends on what.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const themeCookie = cookieStore.get("theme")?.value;
  const themeAttr =
    themeCookie === "dark" || themeCookie === "light" ? themeCookie : undefined;

  return (
    <html
      lang="en"
      data-theme={themeAttr}
      className={`${plexSans.variable} ${sourceSerif.variable} ${plexMono.variable} ${notoBengali.variable}`}
    >
      <body className="flex min-h-screen flex-col bg-bg text-text antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-text focus:px-3 focus:py-2 focus:text-xs focus:text-bg"
        >
          Skip to content
        </a>
        <Navbar initialTheme={themeAttr} />
        <main
          id="main-content"
          className="mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 sm:px-6 sm:py-8"
        >
          {children}
        </main>
        <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-4 text-xs text-text-muted">
          <div>Cairn &middot; Linked notes for developers</div>
          <div className="flex gap-3">
            <a href="/about" className="hover:text-text">
              About
            </a>
            <a href="/terms" className="hover:text-text">
              Terms
            </a>
            <a href="/privacy" className="hover:text-text">
              Privacy
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
