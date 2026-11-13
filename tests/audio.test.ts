import { describe, it, expect, vi } from 'vitest'
import { Sfx } from '../src/audio'

describe('shop confirmation audio', () => {
  it('exposes the shop ding and safely skips it before audio unlock', () => {
    vi.stubGlobal('window', { addEventListener() {} })
    vi.stubGlobal('localStorage', { getItem: () => null })
    try {
      const sfx = new Sfx()
      expect(typeof sfx.ding).toBe('function')
      expect(() => sfx.ding()).not.toThrow()
    } finally { vi.unstubAllGlobals() }
  })
})
