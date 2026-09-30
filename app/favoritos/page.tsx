import { redirect } from 'next/navigation'

// "Favoritos" no menu é o acompanhamento já filtrado — uma tela só pra manter.
export default function Favoritos() {
  redirect('/acompanhamento?filtro=favoritadas')
}
