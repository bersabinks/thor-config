import { describe, expect, it } from 'vitest'
import { compareVersions, parseVersion } from '../versions'

describe('parseVersion', () => {
  it('retire le préfixe v et sépare les segments numériques du suffixe', () => {
    expect(parseVersion('v1.20.4')).toEqual({ numbers: [1, 20, 4], prerelease: null })
    expect(parseVersion('0.7.0.rc5')).toEqual({ numbers: [0, 7, 0], prerelease: 'rc5' })
    expect(parseVersion('0.1-11826')).toEqual({ numbers: [0, 1, 11826], prerelease: null })
  })

  it('renvoie null pour une version inexploitable', () => {
    expect(parseVersion('')).toBeNull()
    expect(parseVersion('inconnue')).toBeNull()
  })
})

describe('compareVersions', () => {
  it('compare segment par segment, quel que soit le nombre de segments', () => {
    expect(compareVersions('1.19.3', '1.20.4')).toBe(-1)
    expect(compareVersions('1.20.4', '1.19.3')).toBe(1)
    expect(compareVersions('1.20', '1.20.0')).toBe(0)
    expect(compareVersions('v1.20.4', '1.20.4')).toBe(0)
    // 20 > 9 : comparaison numérique, pas alphabétique.
    expect(compareVersions('1.9.0', '1.20.0')).toBe(-1)
  })

  it('une pré-version précède la version finale (cas réel WatermelonDS 0.7.0.rc5)', () => {
    expect(compareVersions('0.7.0.rc5', '0.7.0')).toBe(-1)
    expect(compareVersions('0.7.0', '0.7.0.rc5')).toBe(1)
    expect(compareVersions('1.0-beta2', '1.0')).toBe(-1)
  })

  it('versions non comparables → null (pas de faux « à jour »)', () => {
    expect(compareVersions('inconnue', '1.0.0')).toBeNull()
    expect(compareVersions('1.0.0', '')).toBeNull()
  })
})
