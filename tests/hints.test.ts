import { describe, it, expect } from 'vitest'
import { hintFor } from '../src/hints'
import { createDay, step, type Customer } from '../src/sim/game'

function packedOrder() {
  const s = createDay(2, 42)
  const c: Customer = {
    id: 1, type: 'ojol', spot: 0, phase: 'waiting', timer: 0,
    patience: 40, maxPatience: 40, happy: false, look: 1,
    order: { lines: [{ kind: 'bakwan', count: 1 }], wrap: 'plastik', cabe: false, saus: false },
  }
  s.customers = [c]
  s.bungkus = { wrap: 'kertas', items: [{ id: 2, kind: 'bakwan', age: 3, oily: false }], cabe: false, saus: false }
  return s
}

describe('packing hints before risking customer patience', () => {
  it('explains the wrong wrapper before suggesting delivery', () => {
    const s = packedOrder()
    expect(hintFor(s, true)).toBe('Ganti bungkus ke plastik, lalu ketuk pembelinya')
    step(s, [{ t: 'wrap', wrap: 'plastik' }])
    expect(hintFor(s, true)).toBe('Udah sesuai pesanan? Ketuk pembelinya')
    expect(step(s, [{ t: 'serve', spot: 0 }])).toEqual(expect.arrayContaining([expect.objectContaining({ e: 'serve' })]))
    expect(s.stats.wrong).toBe(0)
  })
  it('does not override another customer whose order already matches', () => {
    const s = packedOrder()
    s.customers.push({ ...s.customers[0], id: 3, spot: 1, order: { ...s.customers[0].order, wrap: 'kertas' } })
    expect(hintFor(s, true)).toBe('Udah sesuai pesanan? Ketuk pembelinya')
  })
  it('does not suggest just changing wrapper when the food is also wrong', () => {
    const s = packedOrder()
    s.bungkus!.items[0].kind = 'tahu'
    expect(hintFor(s, true)).toBe('Udah sesuai pesanan? Ketuk pembelinya')
  })
  it('keeps tutorial disabled and urgent overheating advice unchanged', () => {
    const s = packedOrder()
    expect(hintFor(s, false)).toBeNull()
    s.overheated = true
    expect(hintFor(s, true)).toBe('Minyak kepanasan! Kecilin kompornya')
  })
})
