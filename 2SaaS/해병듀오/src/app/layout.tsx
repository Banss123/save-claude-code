import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BizHigh SalesOps — 비즈하이 매장 관리",
  description: "영업자가 할 일을 대시보드가 알려주는 SaaS. 비즈하이의 모든 영업 프로세스를 퀘스트로.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className="h-full antialiased"
    >
      <head>
        {/* Pretendard Variable — 한국어 UI 표준 폰트 (CDN, 추후 next/font/local 마이그) */}
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css"
        />
      </head>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
