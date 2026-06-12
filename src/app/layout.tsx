import type { Metadata, Viewport } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Meteo Huéscar | Observatorio comarcal",
  description: "Predicción y riesgos meteorológicos para la comarca de Huéscar",
  robots: "index, nofollow",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `if("serviceWorker" in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister()})});caches.keys().then(function(ks){ks.forEach(function(k){caches.delete(k)})})}`,
          }}
        />
      </head>
      <body className={manrope.variable}>{children}</body>
    </html>
  );
}
