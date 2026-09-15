import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { downloadToFile, type DownloadProgress } from '../download'

export function fakeFetch(
  body: Uint8Array | null,
  init: { status?: number; headers?: Record<string, string> } = {}
): typeof fetch {
  return (async () =>
    new Response(body as unknown as BodyInit | null, { status: init.status ?? 200, headers: init.headers })) as unknown as typeof fetch
}

let dir = ''
const tmp = () => (dir = mkdtempSync(join(tmpdir(), 'thor-dl-')))
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
  dir = ''
})

describe('downloadToFile', () => {
  it('écrit le fichier, calcule le SHA-256 et remonte la progression', async () => {
    const body = new TextEncoder().encode('contenu officiel')
    const dest = join(tmp(), 'sub', 'file.bin')
    const progress: DownloadProgress[] = []

    const r = await downloadToFile('https://example.test/f', dest, {
      fetchImpl: fakeFetch(body, { headers: { 'content-length': String(body.length) } }),
      onProgress: (p) => progress.push(p),
    })

    expect(readFileSync(dest, 'utf-8')).toBe('contenu officiel')
    expect(r.sha256).toBe(createHash('sha256').update(body).digest('hex'))
    expect(r.bytes).toBe(body.length)
    expect(progress.at(-1)).toEqual({ receivedBytes: body.length, totalBytes: body.length })
    expect(existsSync(`${dest}.part`)).toBe(false)
  })

  it('erreur HTTP : exception, aucun fichier', async () => {
    const dest = join(tmp(), 'f.bin')
    await expect(downloadToFile('https://example.test/404', dest, { fetchImpl: fakeFetch(null, { status: 404 }) })).rejects.toThrow(
      /HTTP 404/
    )
    expect(existsSync(dest)).toBe(false)
    expect(existsSync(`${dest}.part`)).toBe(false)
  })

  it('téléchargement tronqué (taille annoncée non atteinte) : rejeté sans fichier partiel', async () => {
    const dest = join(tmp(), 'f.bin')
    const body = new Uint8Array(10)
    await expect(
      downloadToFile('https://example.test/f', dest, {
        fetchImpl: fakeFetch(body, { headers: { 'content-length': '20' } }),
      })
    ).rejects.toThrow(/incomplet/)
    expect(existsSync(dest)).toBe(false)
    expect(existsSync(`${dest}.part`)).toBe(false)
  })

  it('réponse plus grosse que maxBytes : interrompue', async () => {
    const dest = join(tmp(), 'f.bin')
    await expect(
      downloadToFile('https://example.test/f', dest, { fetchImpl: fakeFetch(new Uint8Array(100)), maxBytes: 50 })
    ).rejects.toThrow(/volumineuse/)
    expect(existsSync(dest)).toBe(false)
  })
})
