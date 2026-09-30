// Ícones traçados do mesmo desenho usado em docs/design/telas/. Todos herdam
// cor e tamanho de quem chama (currentColor + width/height), pra não precisar
// de variante por contexto.
type IconeProps = {
  className?: string
  size?: number
}

function Svg({ size = 16, className, children }: IconeProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function IconeCaixaEntrada(props: IconeProps) {
  return (
    <Svg {...props}>
      <path d="M4 13h4l2 3h4l2-3h4" />
      <path d="M4 13 6.5 5h11L20 13v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z" />
    </Svg>
  )
}

export function IconeEstrela(props: IconeProps) {
  return (
    <Svg {...props}>
      <path d="m12 4 2.4 5 5.6.8-4 3.9 1 5.5-5-2.7-5 2.7 1-5.5-4-3.9 5.6-.8z" />
    </Svg>
  )
}

export function IconeAcompanhamento(props: IconeProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="4" width="5" height="16" rx="1" />
      <rect x="10" y="4" width="5" height="11" rx="1" />
      <rect x="17" y="4" width="4" height="7" rx="1" />
    </Svg>
  )
}

export function IconeTarefas(props: IconeProps) {
  return (
    <Svg {...props}>
      <path d="M9 11l2 2 4-4" />
      <rect x="3" y="4" width="18" height="16" rx="2" />
    </Svg>
  )
}

export function IconeDocumento(props: IconeProps) {
  return (
    <Svg {...props}>
      <path d="M6 4h9l4 4v12a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M9 12h7M9 16h5" />
    </Svg>
  )
}

export function IconeArquivo(props: IconeProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </Svg>
  )
}
