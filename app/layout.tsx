import type { Metadata } from "next";
import { Old_Standard_TT, Inter } from "next/font/google";
import "./globals.css";
import Particles from "@/components/Particles";

const heading = Old_Standard_TT({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-heading",
});

const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: "TouchFeets.com — Let the Savior Touch Your Soles",
  description:
    "Upload bare feet photos to generate reverent, AI-enhanced images with Jesus gently touching your soles. Gothic / cyberpunk catholic aesthetic.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${heading.variable} ${body.variable} antialiased`}>
        <Particles />
        {children}
      </body>
    </html>
  );
}
