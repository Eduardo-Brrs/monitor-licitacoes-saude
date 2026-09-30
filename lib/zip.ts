// Zip mínimo em modo "store" (sem compressão), escrito à mão pra não trazer
// dependência por uma função só: os anexos são quase todos PDF, que já vêm
// comprimidos — comprimir de novo não ganha nada e só gasta CPU.
//
// Cada arquivo entra inteiro (tamanho e CRC conhecidos antes do cabeçalho
// local), então o zip é lido por qualquer programa, inclusive o do Windows.
// Os arquivos vão sendo emitidos um a um, e a rota devolve isso em streaming
// (resposta normal de função da Vercel tem teto de 4,5 MB).

const TABELA_CRC = (() => {
  const tabela = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    tabela[n] = c >>> 0
  }
  return tabela
})()

function crc32(dados: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < dados.length; i++) c = TABELA_CRC[(c ^ dados[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// Data/hora no formato do MS-DOS, que é o que o zip usa.
function dataDos(data: Date): { hora: number; dia: number } {
  return {
    hora: (data.getHours() << 11) | (data.getMinutes() << 5) | Math.floor(data.getSeconds() / 2),
    dia: ((data.getFullYear() - 1980) << 9) | ((data.getMonth() + 1) << 5) | data.getDate(),
  }
}

// Bit 11: nome em UTF-8 (sem ele, acento vira lixo no Windows).
const FLAG_UTF8 = 0x0800

export class ZipEmStreaming {
  private deslocamento = 0
  private central: Uint8Array[] = []
  private quantidade = 0

  // Devolve os bytes que representam o arquivo dentro do zip.
  adicionar(nome: string, dados: Uint8Array, quando = new Date()): Uint8Array {
    const nomeBytes = new TextEncoder().encode(nome)
    const crc = crc32(dados)
    const { hora, dia } = dataDos(quando)

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true) // versão necessária
    local.setUint16(6, FLAG_UTF8, true)
    local.setUint16(8, 0, true) // store
    local.setUint16(10, hora, true)
    local.setUint16(12, dia, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, dados.length, true)
    local.setUint32(22, dados.length, true)
    local.setUint16(26, nomeBytes.length, true)
    local.setUint16(28, 0, true)

    const entrada = new DataView(new ArrayBuffer(46))
    entrada.setUint32(0, 0x02014b50, true)
    entrada.setUint16(4, 20, true)
    entrada.setUint16(6, 20, true)
    entrada.setUint16(8, FLAG_UTF8, true)
    entrada.setUint16(10, 0, true)
    entrada.setUint16(12, hora, true)
    entrada.setUint16(14, dia, true)
    entrada.setUint32(16, crc, true)
    entrada.setUint32(20, dados.length, true)
    entrada.setUint32(24, dados.length, true)
    entrada.setUint16(28, nomeBytes.length, true)
    entrada.setUint32(42, this.deslocamento, true)
    this.central.push(concatenar([new Uint8Array(entrada.buffer), nomeBytes]))
    this.quantidade++

    const bloco = concatenar([new Uint8Array(local.buffer), nomeBytes, dados])
    this.deslocamento += bloco.length
    return bloco
  }

  // Diretório central + fim — fecha o zip.
  finalizar(): Uint8Array {
    const diretorio = concatenar(this.central)
    const fim = new DataView(new ArrayBuffer(22))
    fim.setUint32(0, 0x06054b50, true)
    fim.setUint16(8, this.quantidade, true)
    fim.setUint16(10, this.quantidade, true)
    fim.setUint32(12, diretorio.length, true)
    fim.setUint32(16, this.deslocamento, true)
    return concatenar([diretorio, new Uint8Array(fim.buffer)])
  }
}

function concatenar(partes: Uint8Array[]): Uint8Array {
  const total = partes.reduce((soma, p) => soma + p.length, 0)
  const saida = new Uint8Array(total)
  let pos = 0
  for (const p of partes) {
    saida.set(p, pos)
    pos += p.length
  }
  return saida
}
