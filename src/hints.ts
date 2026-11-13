import { ITEMS } from './sim/menu'
import { checkOrder, isDrained, type GameState } from './sim/game'

/** One line of advice on the counter plank: always for trouble, step by step on the first days. */
export function hintFor(s: GameState, tutorial: boolean): string | null {
  if (s.overheated) return 'Minyak kepanasan! Kecilin kompornya'
  if (s.phase === 'closing') return 'Udah tutup, layani yang masih antre'
  if (!tutorial) return null
  if (s.wok.some((f) => f?.burnt)) return 'Ada yang gosong! Ketuk buat buang'
  if (s.wok.some((f) => f?.dinged)) return 'Udah kuning, ketuk buat angkat!'
  if (s.hand) return ITEMS[s.hand.kind].needsBatter && !s.hand.battered ? 'Celupin ke tepung dulu' : 'Masukin ke wajan'
  const waiting = s.customers.some((c) => c.phase === 'waiting')
  if (s.bungkus && s.bungkus.items.length > 0 && waiting) {
    const packed = s.bungkus
    const customers = s.customers.filter((c) => c.phase === 'waiting')
    // Only suggest a wrapper change when it is the sole mismatch. Another
    // customer's matching order must always win over the first queue spot.
    if (!customers.some((c) => checkOrder(c, packed) === null)) {
      const target = customers.find((c) => checkOrder(c, { ...packed, wrap: c.order.wrap }) === null)
      if (target) return `Ganti bungkus ke ${target.order.wrap}, lalu ketuk pembelinya`
    }
    return 'Udah sesuai pesanan? Ketuk pembelinya'
  }
  if (waiting && s.tray.some((it) => it && isDrained(it))) return 'Ketuk gorengan di peniris buat dibungkus'
  if (s.tray.some((it) => it && !isDrained(it))) return 'Tunggu minyaknya netes dulu'
  if (s.wok.some(Boolean)) return 'Tunggu indikatornya sampai hijau'
  if (waiting) return 'Lihat pesanan, terus ketuk adonannya'
  return 'Nunggu pembeli…'
}
