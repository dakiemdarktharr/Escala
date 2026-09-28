import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Escala — Seller inbox",
  description:
    "A clear next step for every buyer conversation. Review evidence, prepare replies, and keep seller decisions in view.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){var p='system';try{var s=localStorage.getItem('escala-theme');if(s==='light'||s==='dark')p=s;}catch(e){}var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.dataset.themePreference=p;})();` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
