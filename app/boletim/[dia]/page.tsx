import { notFound } from 'next/navigation'
import { Boletim } from '@/components/boletim/boletim'
import {
  buscarDescartadosDoDia,
  buscarEditaisDoDia,
  resumoDoDia,
  vizinhosDoDia,
} from '@/lib/boletim'
import { buscarAvisosDescartadosDoDia, buscarAvisosDoDia } from '@/lib/diarios'

const FORMATO_DIA = /^\d{4}-\d{2}-\d{2}$/

export default async function BoletimDoDia({ params }: PageProps<'/boletim/[dia]'>) {
  const { dia } = await params
  if (!FORMATO_DIA.test(dia)) notFound()

  const [editais, descartados, avisos, avisosDescartados, resumo, vizinhos] = await Promise.all([
    buscarEditaisDoDia(dia),
    buscarDescartadosDoDia(dia),
    buscarAvisosDoDia(dia),
    buscarAvisosDescartadosDoDia(dia),
    resumoDoDia(dia),
    vizinhosDoDia(dia),
  ])

  return (
    <Boletim
      // Remonta ao trocar de dia: a lista congela a ordem enquanto aberta.
      key={dia}
      dia={dia}
      editais={editais}
      descartados={descartados}
      avisos={avisos}
      avisosDescartados={avisosDescartados}
      resumo={resumo}
      anterior={vizinhos.anterior}
      proximo={vizinhos.proximo}
    />
  )
}
