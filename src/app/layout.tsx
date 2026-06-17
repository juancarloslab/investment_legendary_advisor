import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ 
  subsets: ['latin'],
  weight: ['400', '500', '700', '900'],
});

export const metadata: Metadata = {
  title: 'Juan Carlos의 투자 분석 | Museum Brutalism Edition',
  description: '차트·주가·역발상 3종 판독기로 미국 주식을 분석합니다 - Museum Brutalism 디자인',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className={`${inter.className} bg-[#2A2A2A] text-white antialiased`}>
        {children}
      </body>
    </html>
  );
}
