import { describe, it, expect } from 'vitest'
import {
  buildManifest,
  serializeManifest,
  parseManifest,
  verifyAgainstManifest,
  allVerified,
  type ManifestFileEntry,
} from '../manifest'

const HASH_A = 'a'.repeat(64)
const HASH_B = 'b'.repeat(64)

function entry(over: Partial<ManifestFileEntry> = {}): ManifestFileEntry {
  return { relPath: 'saves/a.sav', devicePath: '/sdcard/x/a.sav', sha256: HASH_A, size: 3, verified: true, ...over }
}

describe('manifest — round-trip', () => {
  it('build → serialize → parse conserve les données', () => {
    const m = buildManifest({
      emulatorId: 'melonds-ds',
      serial: 's1',
      createdAt: '2026-01-01',
      kind: 'initial',
      files: [entry()],
    })
    const parsed = parseManifest(serializeManifest(m))
    expect(parsed).toEqual(m)
  })
})

describe('parseManifest — validation stricte (fail-closed)', () => {
  it('rejette un JSON invalide', () => {
    expect(() => parseManifest('{pas du json')).toThrow(/JSON invalide/)
  })
  it('rejette une version non supportée', () => {
    expect(() => parseManifest(JSON.stringify({ version: 2, emulatorId: 'x', kind: 'initial', files: [] }))).toThrow(
      /version/
    )
  })
  it('rejette un emulatorId manquant', () => {
    expect(() => parseManifest(JSON.stringify({ version: 1, kind: 'initial', files: [] }))).toThrow(/emulatorId/)
  })
  it('rejette files non-tableau', () => {
    expect(() =>
      parseManifest(JSON.stringify({ version: 1, emulatorId: 'x', kind: 'initial', files: {} }))
    ).toThrow(/files/)
  })
  it('rejette un sha256 mal formé', () => {
    const bad = { version: 1, emulatorId: 'x', kind: 'initial', files: [{ ...entry(), sha256: 'xyz' }] }
    expect(() => parseManifest(JSON.stringify(bad))).toThrow(/SHA-256/)
  })
  it('rejette un relPath manquant', () => {
    const bad = { version: 1, emulatorId: 'x', kind: 'initial', files: [{ devicePath: '/a', sha256: HASH_A, size: 1 }] }
    expect(() => parseManifest(JSON.stringify(bad))).toThrow(/relPath/)
  })
})

describe('verifyAgainstManifest', () => {
  const manifest = buildManifest({
    emulatorId: 'x',
    serial: 's',
    createdAt: 't',
    kind: 'manual',
    files: [entry({ relPath: 'a', sha256: HASH_A }), entry({ relPath: 'b', sha256: HASH_B })],
  })

  it('ok quand les hashs correspondent', () => {
    const r = verifyAgainstManifest(manifest, new Map([['a', HASH_A], ['b', HASH_B]]))
    expect(r.every((x) => x.status === 'ok')).toBe(true)
    expect(allVerified(r)).toBe(true)
  })
  it('mismatch quand un hash diffère', () => {
    const r = verifyAgainstManifest(manifest, new Map([['a', HASH_A], ['b', HASH_A]]))
    expect(r.find((x) => x.relPath === 'b')!.status).toBe('mismatch')
    expect(allVerified(r)).toBe(false)
  })
  it('missing quand un fichier attendu est absent', () => {
    const r = verifyAgainstManifest(manifest, new Map([['a', HASH_A]]))
    expect(r.find((x) => x.relPath === 'b')!.status).toBe('missing')
    expect(allVerified(r)).toBe(false)
  })
  it('extra quand un fichier non attendu est présent (toléré)', () => {
    const r = verifyAgainstManifest(manifest, new Map([['a', HASH_A], ['b', HASH_B], ['c', HASH_A]]))
    expect(r.find((x) => x.relPath === 'c')!.status).toBe('extra')
    expect(allVerified(r)).toBe(true)
  })
})
