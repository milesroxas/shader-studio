import { describe, expect, it } from 'vitest'

import { DEFAULT_GROUND } from './effect.js'
import {
  GROUND_HEX_MESSAGE,
  groundAttributes,
  hasGround,
  isGroundHex,
  lookGround,
  sameGround,
  studioGround,
} from './ground.js'

describe('lookGround', () => {
  it('keeps valid faces, lowercased, and drops the rest', () => {
    expect(lookGround({ dark: '#0A0A0A', light: '#fff' })).toEqual({ dark: '#0a0a0a' })
    expect(lookGround({ dark: '', light: null })).toEqual({})
    expect(lookGround(null)).toEqual({})
    expect(lookGround('#000000')).toEqual({})
  })

  it('knows a six-digit hex and the message for anything else', () => {
    expect(isGroundHex('#abcdef')).toBe(true)
    expect(isGroundHex('#ABCDEF')).toBe(true)
    expect(isGroundHex('#abc')).toBe(false)
    expect(isGroundHex('abcdef')).toBe(false)
    expect(GROUND_HEX_MESSAGE).toMatch(/six-digit hex/)
  })
})

describe('studioGround', () => {
  it("answers the look's own face, else the Studio ground", () => {
    expect(studioGround({ dark: '#000000' }, 'dark', DEFAULT_GROUND)).toBe('#000000')
    expect(studioGround({ dark: '#000000' }, 'light', DEFAULT_GROUND)).toBe(DEFAULT_GROUND.light)
    expect(studioGround(undefined, 'dark', { dark: '#111111', light: '#eeeeee' })).toBe('#111111')
  })

  it('compares grounds face by face', () => {
    expect(sameGround({}, undefined)).toBe(true)
    expect(sameGround({ dark: '#000000' }, { dark: '#000000' })).toBe(true)
    expect(sameGround({ dark: '#000000' }, { dark: '#000001' })).toBe(false)
    expect(hasGround({})).toBe(false)
    expect(hasGround({ light: '#ffffff' })).toBe(true)
  })
})

describe('groundAttributes', () => {
  it('gives a frame nothing without a ground', () => {
    expect(groundAttributes({})).toEqual({})
    expect(groundAttributes(undefined)).toEqual({})
  })

  it('marks the frame and sets a custom property per face', () => {
    expect(groundAttributes({ dark: '#000000' })).toEqual({
      'data-visual-ground': '',
      style: { '--visual-ground-dark': '#000000', '--visual-ground-light': undefined },
    })
  })
})
