import { ITEMS } from './sim/menu'
import { isDrained, type GameState } from './sim/game'

/** One line of advice on the counter plank: always for trouble, step by step on the first days. */
export function hintFor(s: GameState, tutorial: boolean): string | null {
  if (s.overheated) return 'Minyak kepanasan! Kecilin kompornya'
  if (s.phase === 'closing') return 'Udah tutup, layani yang masih antre'
  if (!tutorial) return null
  if (s.wok.some((f) => f?.burnt)) return 'Ada yang gosong! Ketuk buat buang'
  if (s.wok.some((f) => f?.dinged)) return 'Udah kuning, ketuk buat angkat!'
  if (s.hand) return ITEMS[s.hand.kind].needsBatter && !s.hand.battered ? 'Celupin ke tepung dulu' : 'Masukin ke wajan'
  const waiting = s.customers.some((c) => c.phase === 'waiting')
  if (s.bungkus && s.bungkus.items.length > 0 && waiting) return 'Udah sesuai pesanan? Ketuk pembelinya'
  if (waiting && s.tray.some((it) => it && isDrained(it))) return 'Ketuk gorengan di peniris buat dibungkus'
  if (s.tray.some((it) => it && !isDrained(it))) return 'Tunggu minyaknya netes dulu'
  if (s.wok.some(Boolean)) return 'Tunggu indikatornya sampai hijau'
  if (waiting) return 'Lihat pesanan, terus ketuk adonannya'
  return 'Nunggu pembeli…'
}
