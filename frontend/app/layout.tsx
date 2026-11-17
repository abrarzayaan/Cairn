import type { Metadata } from "next";
import { cookies } from "next/headers";
import {
  Inter,
  JetBrains_Mono,
  Lora,
  Noto_Sans_Bengali,
} from "next/font/google";
import AppShell from "@/components/AppShell";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const lora = Lora({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-lora",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-jetbrains-mono",
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
      className={`${inter.variable} ${lora.variable} ${jetbrainsMono.variable} ${notoBengali.variable}`}
    >
      <body className="min-h-screen bg-surface-0 font-sans text-text-primary antialiased">
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-sm focus:bg-text-primary focus:px-3 focus:py-2 focus:text-xs focus:text-surface-0"
        >
          Skip to content
        </a>
        <AppShell initialTheme={themeAttr}>{children}</AppShell>
      </body>
    </html>
  );
}
