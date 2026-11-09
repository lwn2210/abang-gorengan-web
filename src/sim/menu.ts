// What the cart sells and how each day gets harder. Plain data so the render,
// the bot and the tests all read the same numbers.

export type ItemKind = 'bakwan' | 'tahu' | 'pisang' | 'mendoan' | 'cireng' | 'combro'
export type Wrap = 'kertas' | 'plastik'
export type Extra = 'cabe' | 'saus'
export type CustomerType = 'biasa' | 'ojol' | 'rewel'

export interface ItemSpec {
  name: string
  /** Has to go through the flour bowl before the wok. */
  needsBatter: boolean
  /** Seconds in oil at normal heat (180 °C) until it's done. */
  cookTime: number
  /** How long it stays "pas" after that, as a fraction of cookTime. */
  window: number
  price: number
}

export const ITEMS: Record<ItemKind, ItemSpec> = {
  bakwan: { name: 'Bakwan', needsBatter: false, cookTime: 6, window: 0.6, price: 1500 },
  tahu: { name: 'Tahu isi', needsBatter: true, cookTime: 6.5, window: 0.55, price: 1500 },
  pisang: { name: 'Pisang goreng', needsBatter: true, cookTime: 7, window: 0.5, price: 2000 },
  mendoan: { name: 'Tempe mendoan', needsBatter: true, cookTime: 4, window: 0.45, price: 1500 },
  cireng: { name: 'Cireng', needsBatter: false, cookTime: 5, window: 0.5, price: 1000 },
  combro: { name: 'Combro', needsBatter: false, cookTime: 8, window: 0.4, price: 2000 },
}

/** Order the items unlock in, one per day after the first. */
export const UNLOCK_ORDER: readonly ItemKind[] = ['bakwan', 'tahu', 'pisang', 'mendoan', 'cireng', 'combro']

export const WRAP_CAPACITY: Record<Wrap, number> = { kertas: 4, plastik: 8 }

export const CUSTOMER_LABEL: Record<CustomerType, string> = { biasa: '', ojol: 'Ojol', rewel: 'Rewel' }

export interface DayConfig {
  day: number
  menu: ItemKind[]
  wraps: Wrap[]
  extras: Extra[]
  /** Relative chance of each customer type. */
  types: Partial<Record<CustomerType, number>>
  /** Mean seconds between arrivals at the start of the day (gets shorter towards sore). */
  arrivalEvery: number
  /** Multiplies every customer's patience. */
  patience: number
  /** Biggest order a regular customer makes. */
  maxItems: number
  /** Setoran: earn at least this to pass the day. */
  target: number
}

export function dayConfig(day: number): DayConfig {
  const d = Math.max(1, Math.floor(day))
  const menu = UNLOCK_ORDER.slice(0, Math.min(UNLOCK_ORDER.length, d + 2))
  const types: DayConfig['types'] =
    d === 1 ? { biasa: 1 } : d === 2 ? { biasa: 0.72, ojol: 0.28 } : d === 3 ? { biasa: 0.55, ojol: 0.25, rewel: 0.2 } : { biasa: 0.45, ojol: 0.3, rewel: 0.25 }
  return {
    day: d,
    menu,
    wraps: d >= 2 ? ['kertas', 'plastik'] : ['kertas'],
    extras: d >= 3 ? ['cabe', 'saus'] : ['cabe'],
    types,
    arrivalEvery: Math.max(6, 11 - 1.1 * (d - 1)),
    patience: Math.max(0.7, 1 - 0.06 * (d - 1)),
    maxItems: Math.min(4, d + 1),
    target: Math.round((30000 + 14000 * (d - 1) + 2000 * Math.max(0, d - 4) ** 2) / 1000) * 1000,
  }
}

/** "Rp12.500" — dots for thousands, the Indonesian way. */
export function rupiah(n: number): string {
  const sign = n < 0 ? '-' : ''
  const digits = String(Math.round(Math.abs(n)))
  return `${sign}Rp${digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`
}
