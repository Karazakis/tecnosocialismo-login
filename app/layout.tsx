import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://login.tecnosocialismo.com"),
  title: "Login — Il tuo account Tecnosocialismo",
  description: "Un solo account per Rizoma, Iskra, Cloud e i servizi della suite Tecnosocialismo.",
  openGraph: {
    title: "Login — Un account, tutta la suite",
    description: "L'identità condivisa di Rizoma, Iskra, Cloud e dei servizi Tecnosocialismo.",
    type: "website",
    images: [{ url: "/og.png", width: 1733, height: 908, alt: "LOGIN — Un account, tutta la suite" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Login — Un account, tutta la suite",
    description: "L'identità condivisa dei servizi Tecnosocialismo.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="it">
      <body>{children}</body>
    </html>
  );
}
