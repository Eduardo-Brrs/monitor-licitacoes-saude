// CSV pro Excel em português: separador ";" (a vírgula é o decimal no
// Brasil, com "," o Excel junta tudo numa coluna só) e BOM UTF-8 no começo
// (sem ele o Excel abre como ANSI e estraga os acentos).

type Celula = string | number | null | undefined

function celula(valor: Celula): string {
  if (valor === null || valor === undefined) return ''
  const texto = String(valor)
  return /[";\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

export function montarCsv(cabecalho: string[], linhas: Celula[][]): string {
  return '﻿' + [cabecalho, ...linhas].map((linha) => linha.map(celula).join(';')).join('\r\n')
}

export function respostaCsv(conteudo: string, nomeArquivo: string): Response {
  return new Response(conteudo, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nomeArquivo}"`,
      'Cache-Control': 'no-store',
    },
  })
}

// Número no formato que o Excel pt-BR lê como número (1234,56), sem R$.
export function numeroCsv(valor: number | null): string {
  if (valor === null || valor === 0) return ''
  return valor.toFixed(2).replace('.', ',')
}

// Data dd/mm/aaaa (e hora, quando tem) no fuso de Maceió.
export function dataCsv(iso: string | null, comHora = false): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Maceio',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    ...(comHora ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(iso))
}
