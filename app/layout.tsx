import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'NewsFlow AI — seu jornal customizado',
  description:
    'Curadoria diária por IA das notícias que importam para você. Como um amigo atento que leu tudo e te conta o que vale.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
