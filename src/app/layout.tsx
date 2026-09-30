import type { Metadata } from "next";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: "Escala — Hộp thư người bán",
  description:
    "Hộp thư hỗ trợ người bán: xem nguồn tham chiếu, chuẩn bị trả lời và theo dõi từng quyết định.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){var p='system';try{var s=localStorage.getItem('escala-theme');if(s==='light'||s==='dark')p=s;}catch(e){}var d=p==='dark'||(p==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light';document.documentElement.dataset.themePreference=p;})();` }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
