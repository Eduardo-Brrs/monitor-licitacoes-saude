import { lerDetalheSalvo } from '@/lib/detalhe-pncp'
import { buscarEditalPorNumero } from '@/lib/edital'
import { nomeDeArquivoLegivel } from '@/lib/formato'
import { ZipEmStreaming } from '@/lib/zip'

// "Baixar tudo (.zip)" da tela do edital (DESIGN.md, tela 02). Baixa cada
// anexo da lista salva direto do PNCP e vai emitindo o zip em streaming —
// resposta comum de função da Vercel tem teto de 4,5 MB, e streaming não
// (docs da Vercel, conferido em 2026-09-28). Anexo que falhar (PNCP instável)
// não derruba o resto: entra um LEIA-ME.txt dizendo quais faltaram.
export const maxDuration = 120

const TIMEOUT_POR_ARQUIVO_MS = 30_000
const DOWNLOADS_SIMULTANEOS = 4

// O PNCP manda o nome certo no content-disposition ("...pdf"); o título da
// lista às vezes vem sem extensão.
function nomeDoArquivo(res: Response, reserva: string): string {
  const cabecalho = res.headers.get('content-disposition') ?? ''
  const utf8 = cabecalho.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8) return decodeURIComponent(utf8[1])
  const simples = cabecalho.match(/filename="?([^";]+)"?/i)
  if (simples) return simples[1]
  return /\.[a-z0-9]{2,4}$/i.test(reserva) ? reserva : `${reserva}.pdf`
}

// Windows não aceita esses caracteres em nome de arquivo. Decodifica antes
// o "%C2%BA" que às vezes vem no nome (ver nomeDeArquivoLegivel).
function nomeSeguro(nome: string): string {
  return nomeDeArquivoLegivel(nome).replace(/[\\/:*?"<>|]+/g, '_').trim() || 'arquivo'
}

export async function GET(_request: Request, { params }: RouteContext<'/edital/[numero]/anexos'>) {
  const { numero } = await params
  const edital = await buscarEditalPorNumero(decodeURIComponent(numero))
  if (!edital) return new Response('edital não encontrado', { status: 404 })

  const { arquivos } = await lerDetalheSalvo(edital.id)
  const lista = (arquivos ?? []).filter((a) => a.statusAtivo !== false)
  if (lista.length === 0) return new Response('este edital não tem anexos salvos', { status: 404 })

  const zip = new ZipEmStreaming()
  const usados = new Set<string>()
  const falhas: string[] = []

  // Baixa até DOWNLOADS_SIMULTANEOS anexos ao mesmo tempo (um por vez levou
  // 56s num edital de 39 MB), mas escreve no zip na ordem da lista.
  const baixar = (arquivo: (typeof lista)[number]) =>
    fetch(arquivo.url, { signal: AbortSignal.timeout(TIMEOUT_POR_ARQUIVO_MS) }).then(async (res) => {
      if (!res.ok) throw new Error(`PNCP respondeu ${res.status}`)
      return { res, dados: new Uint8Array(await res.arrayBuffer()) }
    })

  const corpo = new ReadableStream<Uint8Array>({
    async start(controller) {
      const downloads: ReturnType<typeof baixar>[] = []
      for (let i = 0; i < Math.min(DOWNLOADS_SIMULTANEOS, lista.length); i++) downloads.push(baixar(lista[i]))
      // Evita "unhandled rejection" de download que falha antes da vez dele.
      downloads.forEach((d) => d.catch(() => {}))

      for (let i = 0; i < lista.length; i++) {
        const arquivo = lista[i]
        const titulo = arquivo.titulo ?? arquivo.nomeArquivo ?? `Documento ${arquivo.sequencialDocumento}`
        try {
          const { res, dados } = await downloads[i]

          // Dois anexos com o mesmo nome: numera o segundo.
          let nome = nomeSeguro(nomeDoArquivo(res, titulo))
          for (let n = 2; usados.has(nome.toLowerCase()); n++) {
            nome = nomeSeguro(nomeDoArquivo(res, titulo)).replace(/(\.[^.]+)?$/, ` (${n})$1`)
          }
          usados.add(nome.toLowerCase())
          controller.enqueue(zip.adicionar(nome, dados))
        } catch (err) {
          falhas.push(`${titulo}: ${err instanceof Error ? err.message : String(err)}`)
        } finally {
          const proximo = i + DOWNLOADS_SIMULTANEOS
          if (proximo < lista.length) {
            const d = baixar(lista[proximo])
            d.catch(() => {})
            downloads.push(d)
          }
        }
      }

      if (falhas.length > 0) {
        const texto =
          'Estes anexos não puderam ser baixados do PNCP agora (o portal costuma ficar instável).\r\n' +
          'Tente de novo mais tarde, ou baixe um a um pela tela do edital.\r\n\r\n' +
          falhas.map((f) => `- ${f}`).join('\r\n') +
          '\r\n'
        controller.enqueue(zip.adicionar('LEIA-ME - anexos que faltaram.txt', new TextEncoder().encode(texto)))
      }

      controller.enqueue(zip.finalizar())
      controller.close()
    },
  })

  const nomeZip = `anexos-${edital.numeroCompra ? `${edital.numeroCompra}-${edital.anoCompra}` : edital.id}.zip`.replace(/[^\w.-]+/g, '-')
  return new Response(corpo, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${nomeZip}"`,
      'Cache-Control': 'no-store',
    },
  })
}
