import type { Metadata, Viewport } from "next";
import "./globals.css";
import { LanguageProvider } from "@/lib/i18n";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { AndroidInstallPrompt } from "@/components/pwa/AndroidInstallPrompt";

export const metadata: Metadata = {
  title: "Bothra CMS — Construction & Site Operations",
  description: "Enterprise Construction Project, Site Operations & Financial Management Platform",
  manifest: "/manifest.webmanifest",
  applicationName: "Bothra CMS",
  appleWebApp: { capable: true, title: "Bothra", statusBarStyle: "black-translucent" },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes",
    "theme-color": "#0b1020",
    "msapplication-TileColor": "#0b1020",
    "format-detection": "telephone=no",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1020",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Loaded at runtime (not at build time) so builds work offline; the
            font stacks in tailwind.config.ts fall back to system fonts. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Plus+Jakarta+Sans:wght@600;700;800&family=Noto+Sans+Devanagari:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="min-h-screen flex flex-col">
        <LanguageProvider>
          <ServiceWorkerRegister />
          <AndroidInstallPrompt />
          {children}
        </LanguageProvider>
      </body>
    </html>
  );
}
