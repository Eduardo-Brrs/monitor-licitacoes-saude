import { notFound } from 'next/navigation'
import { Boletim } from '@/components/boletim/boletim'
import {
  buscarDescartadosDoDia,
  buscarEditaisDoDia,
  diaDoBoletimMaisRecente,
  resumoDoDia,
  vizinhosDoDia,
} from '@/lib/boletim'
import { buscarAvisosDescartadosDoDia, buscarAvisosDoDia } from '@/lib/diarios'

// A caixa de entrada abre no boletim mais recente que tem conteúdo — não na
// data de hoje: fim de semana e feriado não publicam, e cair numa tela vazia
// seria o comportamento errado pra tela mais usada do sistema.
export default async function Home() {
  const dia = await diaDoBoletimMaisRecente()
  if (!dia) notFound()

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
