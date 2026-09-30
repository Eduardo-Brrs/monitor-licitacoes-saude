import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import { AvisoFontesDoLayout } from "@/components/shell/aviso-fontes";
import { Sidebar } from "@/components/shell/sidebar";
import "./globals.css";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const plexSans = IBM_Plex_Sans({
  variable: "--font-plex-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["500"],
});

// Tudo aqui é leitura de banco que muda a cada sync (contador de não vistos,
// horário do último sync, lista do dia). Sem isso o Next prerenderiza no build
// e a interface mostra número congelado da hora do deploy.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: `Boletim — ${process.env.NOME_EMPRESA ?? "Licitações"}`,
  description: "Monitoramento de editais de licitação da área da saúde em Alagoas",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full text-ink">
        <Sidebar />
        <main className="flex min-w-0 grow flex-col">
          <AvisoFontesDoLayout />
          {children}
        </main>
      </body>
    </html>
  );
}
