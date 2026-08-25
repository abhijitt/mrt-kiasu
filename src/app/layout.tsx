import type { Metadata, Viewport } from "next";
import { Inter, Press_Start_2P } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/i18n/I18nProvider";
import { isProductionDeployment, siteUrl } from "@/lib/site";

// The pixel face is used for headings, numbers and chrome only — it is
// genuinely hard to read at body sizes on a phone.
const pressStart = Press_Start_2P({
  variable: "--font-press-start",
  weight: "400",
  subsets: ["latin"],
  display: "swap",
});

const body = Inter({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: "MRT Kiasu — stand at the right door",
    template: "%s",
  },
  description:
    "Stand at the right door. Singapore MRT platform positions for the fastest exit and transfer.",
  applicationName: "MRT Kiasu",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "MRT Kiasu" },
  formatDetection: { telephone: false },
  manifest: "/manifest.webmanifest",
  // Belt and braces with robots.txt: that file asks crawlers not to fetch,
  // this tells them not to list. A page linked from somewhere else can still
  // be indexed on the strength of the link alone despite a Disallow.
  ...(isProductionDeployment() ? {} : { robots: { index: false, follow: false } }),
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  openGraph: {
    title: "MRT Kiasu",
    description:
      "Stand at the right door. Singapore MRT platform positions for the fastest exit and transfer.",
    type: "website",
    locale: "en_SG",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f1e8" },
    { media: "(prefers-color-scheme: dark)", color: "#14141f" },
  ],
};

/**
 * Applies the saved theme before first paint. Without this the page flashes
 * the system theme before React hydrates and corrects it.
 */
const themeScript = `
(function () {
  try {
    var t = localStorage.getItem("mrt-kiasu:theme");
    if (t === "dark" || t === "light") {
      document.documentElement.setAttribute("data-theme", t);
    }
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en-SG"
      className={`${pressStart.variable} ${body.variable}`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="antialiased">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
