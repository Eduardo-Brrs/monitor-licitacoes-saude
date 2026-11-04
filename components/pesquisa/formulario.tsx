import type { Municipio } from '@/lib/municipios'
import {
  ESFERAS,
  MODALIDADES_PESQUISA,
  NOMES_SEGMENTOS,
  ORIGENS,
  STATUS_PESQUISA,
  TODAS_UFS,
  UFS_NORDESTE,
  rotuloDoSegmento,
  type FiltrosPesquisa,
} from '@/lib/pesquisa'

// Formulário GET puro (docs/design/telas/07-pesquisa.html): tudo vira
// parâmetro da URL, então a busca funciona sem JavaScript, volta com o botão
// do navegador e pode ir pro favorito. Os atalhos (Nordeste, hoje, 7 dias…)
// são botões de envio com nome — mandam o formulário inteiro mais o atalho.

const CLASSE_ROTULO = 'text-[11px] uppercase tracking-[0.05em] text-faint'
const CLASSE_CAMPO =
  'box-border h-10 w-full rounded-control border border-border-strong bg-surface px-[11px] text-[13px] text-ink placeholder:text-faint'
const CLASSE_SECAO = 'flex flex-col gap-[11px] border-t border-[#edebe5] px-[18px] py-4'
const CLASSE_CHECK = 'inline-flex cursor-pointer items-center gap-[7px] text-[13px] text-ink'
const CLASSE_INPUT_CHECK = 'm-0 size-[15px] accent-accent'
const CLASSE_LINK = 'cursor-pointer border-0 bg-transparent px-0.5 py-1 text-[12.5px] text-accent underline hover:text-accent-strong'
// Pílula: checkbox escondido dentro do rótulo, aparência muda quando marcado.
const CLASSE_PILULA =
  'inline-flex h-8 min-w-[42px] cursor-pointer items-center justify-center rounded-full border border-border-strong bg-surface px-[11px] text-[12.5px] font-medium text-ink hover:border-ink has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-white has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent'

function Check({ nome, valor, marcado, children, title }: {
  nome: string
  valor: string
  marcado: boolean
  children: React.ReactNode
  title?: string
}) {
  return (
    <label className={CLASSE_CHECK} title={title}>
      <input type="checkbox" name={nome} value={valor} defaultChecked={marcado} className={CLASSE_INPUT_CHECK} />
      {children}
    </label>
  )
}

export function FormularioPesquisa({ filtros, municipios }: { filtros: FiltrosPesquisa; municipios: Municipio[] }) {
  const ufsFora = filtros.ufs.filter((u) => !UFS_NORDESTE.includes(u))
  const outrasUfs = TODAS_UFS.filter((u) => !UFS_NORDESTE.includes(u) && !filtros.ufs.includes(u))

  return (
    <form action="/pesquisa" method="get" className="flex flex-col rounded-card border border-border bg-surface">
      <input type="hidden" name="f" value="1" />

      <div className="flex items-end gap-3.5 px-[18px] pt-4 pb-4">
        <div className="flex grow flex-col gap-1.5">
          <label htmlFor="pesquisa-q" className={CLASSE_ROTULO}>
            Objeto, itens e anotações
          </label>
          <input
            id="pesquisa-q"
            type="search"
            name="q"
            defaultValue={filtros.q}
            placeholder="ex.: curativo, alginato, cateter"
            className={CLASSE_CAMPO}
          />
        </div>
        <label className={`${CLASSE_CHECK} h-10`}>
          <input type="checkbox" name="exata" value="1" defaultChecked={filtros.exata} className={CLASSE_INPUT_CHECK} />
          frase exata
        </label>
        <button
          type="submit"
          className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-control border border-accent bg-accent px-5 text-[13px] font-medium text-white hover:bg-accent-strong"
        >
          <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="6" />
            <path d="m20 20-4.4-4.4" />
          </svg>
          Buscar
        </button>
      </div>
      <p className="m-0 mx-[18px] -mt-1.5 mb-3 text-[12px] text-faint">
        Ignora acentos e maiúsculas. Procura no objeto, nos itens de cada edital e nas suas anotações. Órgão também
        pela sigla (FUNDEPES, AMGESP…).
      </p>

      <div className={CLASSE_SECAO}>
        <div className="flex items-baseline gap-2.5">
          <span className={CLASSE_ROTULO}>Segmentos</span>
          <span className="text-[12px] text-faint">nenhum marcado = todos (inclusive o que não bate keyword nenhuma)</span>
        </div>
        <div className="flex flex-wrap gap-x-[22px] gap-y-2">
          {NOMES_SEGMENTOS.map((nome) => (
            <Check key={nome} nome="seg" valor={nome} marcado={filtros.segmentos.includes(nome)}>
              {rotuloDoSegmento(nome)}
            </Check>
          ))}
        </div>
      </div>

      <div className={CLASSE_SECAO}>
        <div className="flex items-center gap-3">
          <span className={CLASSE_ROTULO}>Estados</span>
          <button type="submit" name="ufs_atalho" value="al" className={CLASSE_LINK}>
            Só Alagoas
          </button>
          <button type="submit" name="ufs_atalho" value="nordeste" className={CLASSE_LINK}>
            Nordeste
          </button>
          <button type="submit" name="ufs_atalho" value="todos" className={CLASSE_LINK}>
            Todos
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-[7px]">
          {[...UFS_NORDESTE, ...ufsFora].map((uf) => (
            <label key={uf} className={CLASSE_PILULA}>
              <input type="checkbox" name="uf" value={uf} defaultChecked={filtros.ufs.includes(uf)} className="sr-only" />
              {uf}
            </label>
          ))}
          {outrasUfs.length > 0 && (
            <>
              <span aria-hidden="true" className="mx-1 h-8 w-px bg-border" />
              <label htmlFor="pesquisa-uf-extra" className="sr-only">
                Acrescentar outro estado
              </label>
              <select
                id="pesquisa-uf-extra"
                name="uf_extra"
                defaultValue=""
                className="h-8 w-[190px] rounded-control border border-border-strong bg-surface px-2 text-[12.5px] text-ink"
              >
                <option value="">+ outros estados…</option>
                {outrasUfs.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        <div className="flex gap-3.5 pt-1">
          <div className="flex w-[300px] flex-col gap-1.5">
            <label htmlFor="pesquisa-cidade" className={CLASSE_ROTULO}>
              Cidade
            </label>
            <input
              id="pesquisa-cidade"
              type="text"
              name="cidade"
              defaultValue={filtros.cidade}
              list="pesquisa-cidades"
              autoComplete="off"
              placeholder="todas as cidades dos estados marcados"
              className={CLASSE_CAMPO}
            />
            <datalist id="pesquisa-cidades">
              {municipios.map((m) => (
                <option key={m.ibge} value={m.nome}>
                  {filtros.ufs.length > 1 ? m.uf : undefined}
                </option>
              ))}
            </datalist>
          </div>
          <div className="flex grow flex-col gap-1.5">
            <span className={CLASSE_ROTULO}>Esfera</span>
            <div className="flex h-10 items-center gap-[22px]">
              {ESFERAS.map((e) => (
                <Check key={e.valor} nome="esfera" valor={e.valor} marcado={filtros.esferas.includes(e.valor)}>
                  {e.rotulo}
                </Check>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={CLASSE_SECAO}>
        <div className="flex gap-3.5">
          <div className="flex grow flex-col gap-1.5">
            <label htmlFor="pesquisa-orgao" className={CLASSE_ROTULO}>
              Órgão — nome, sigla ou CNPJ
            </label>
            <input
              id="pesquisa-orgao"
              type="text"
              name="orgao"
              defaultValue={filtros.orgao}
              placeholder="ex.: FUNDEPES, CNPJ ou código 926703"
              className={CLASSE_CAMPO}
            />
          </div>
          <div className="flex w-[260px] flex-col gap-1.5">
            <label htmlFor="pesquisa-numero" className={CLASSE_ROTULO}>
              Nº do edital ou processo
            </label>
            <input
              id="pesquisa-numero"
              type="text"
              name="numero"
              defaultValue={filtros.numero}
              placeholder="ex.: 63/2026 ou 5800.051825/2026"
              className={`${CLASSE_CAMPO} font-mono`}
            />
          </div>
        </div>
      </div>

      <div className={CLASSE_SECAO}>
        <div className="flex flex-wrap gap-x-10 gap-y-4">
          <div className="flex flex-col gap-[9px]">
            <span className={CLASSE_ROTULO}>Modalidade</span>
            <div className="flex flex-wrap gap-x-[22px] gap-y-2">
              {MODALIDADES_PESQUISA.map((m) => (
                <Check
                  key={m.valor}
                  nome="mod"
                  valor={m.valor}
                  marcado={filtros.modalidades.includes(m.valor)}
                  title={m.valor === 'outras' ? 'Credenciamento, concorrência, inexigibilidade… — a captura automática não olha essas' : undefined}
                >
                  {m.rotulo}
                </Check>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-[9px]">
            <span className={CLASSE_ROTULO}>Origem</span>
            <div className="flex flex-wrap gap-x-[22px] gap-y-2">
              {ORIGENS.map((o) => (
                <Check key={o.valor} nome="origem" valor={o.valor} marcado={filtros.origens.includes(o.valor)}>
                  {o.rotulo}
                </Check>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={CLASSE_SECAO}>
        <div className="flex flex-wrap items-end gap-3.5">
          <div className="flex flex-col gap-1.5">
            <span className={CLASSE_ROTULO}>Publicação</span>
            <div className="flex items-center gap-[7px]">
              <input type="date" name="pub_de" defaultValue={filtros.pubDe ?? ''} aria-label="Publicação de" className={`${CLASSE_CAMPO} w-[148px] font-mono`} />
              <span className="text-[12.5px] text-faint">até</span>
              <input type="date" name="pub_ate" defaultValue={filtros.pubAte ?? ''} aria-label="Publicação até" className={`${CLASSE_CAMPO} w-[148px] font-mono`} />
            </div>
          </div>
          <div className="flex h-10 items-center gap-[7px]">
            {[
              ['hoje', 'hoje'],
              ['ontem', 'ontem'],
              ['7dias', '7 dias'],
            ].map(([valor, rotulo]) => (
              <button
                key={valor}
                type="submit"
                name="periodo"
                value={valor}
                className="h-8 min-w-[42px] cursor-pointer rounded-full border border-border-strong bg-surface px-[11px] text-[12.5px] font-medium text-ink hover:border-ink"
              >
                {rotulo}
              </button>
            ))}
          </div>
          <span aria-hidden="true" className="mx-1 h-10 w-px bg-border" />
          <div className="flex flex-col gap-1.5">
            <span className={CLASSE_ROTULO}>Abertura / prazo</span>
            <div className="flex items-center gap-[7px]">
              <input type="date" name="ab_de" defaultValue={filtros.abDe ?? ''} aria-label="Abertura de" className={`${CLASSE_CAMPO} w-[148px] font-mono`} />
              <span className="text-[12.5px] text-faint">até</span>
              <input type="date" name="ab_ate" defaultValue={filtros.abAte ?? ''} aria-label="Abertura até" className={`${CLASSE_CAMPO} w-[148px] font-mono`} />
            </div>
          </div>
        </div>
      </div>

      <div className={`${CLASSE_SECAO} flex-row flex-wrap items-center gap-7`}>
        <Check nome="abertas" valor="1" marcado={filtros.abertas}>
          Só abertas
        </Check>
        <Check nome="anexos" valor="1" marcado={filtros.comAnexos}>
          Com anexos
        </Check>
        <span aria-hidden="true" className="h-[22px] w-px bg-border" />
        <span className={CLASSE_ROTULO}>Nosso status</span>
        {STATUS_PESQUISA.map((s) => (
          <Check key={s.valor} nome="st" valor={s.valor} marcado={filtros.status.includes(s.valor)}>
            {s.rotulo}
          </Check>
        ))}
      </div>
    </form>
  )
}
