import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf-parse (via pdfjs-dist) carrega um worker com import() dinâmico que o
  // bundler do Next quebra ("Cannot find module '.../pdf.worker.mjs'") — opt
  // out do bundling deles, usa require nativo do Node em runtime. Achado
  // implementando o fallback de leitura de PDF do DOE-AL em 2026-09-14.
  // @napi-rs/canvas adicionado em 2026-09-15: é o pacote nativo que fornece
  // os polyfills DOMMatrix/Path2D/ImageData que o 'pdf-parse/worker' registra
  // globalmente — sem excluir do bundling, o require nativo dele falhava em
  // runtime na Vercel ("DOMMatrix is not defined"), mesmo funcionando local.
  serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"],
};

export default nextConfig;
