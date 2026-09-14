/**
 * Lecture/écriture minimale du format PARAM.SFO (PSF) de la PS Vita.
 *
 * En-tête (20 octets, little-endian) :
 *   0x00 magic "\0PSF" · 0x04 version (0x0101) · 0x08 début table des clés
 *   0x0C début table des données · 0x10 nombre d'entrées
 * Index (16 octets par entrée) :
 *   u16 offset de clé · u16 format (0x0004 utf8-S, 0x0204 utf8 NUL-terminé, 0x0404 int32)
 *   u32 longueur utilisée · u32 longueur max · u32 offset de donnée
 */

export type SfoValue = string | number

export interface VitaTitleInfo {
  title: string
  titleId: string
}

const MAGIC = [0x00, 0x50, 0x53, 0x46]
const FMT_UTF8_SPECIAL = 0x0004
const FMT_UTF8 = 0x0204
const FMT_INT32 = 0x0404
const HEADER_SIZE = 20
const INDEX_ENTRY_SIZE = 16

/** Title ID PS Vita : 4 lettres + 5 chiffres (ex. PCSE00001). */
export const TITLE_ID_RE = /^[A-Z]{4}\d{5}$/

function invalid(reason: string): Error {
  return new Error(`PARAM.SFO invalide : ${reason}`)
}

export function parseSfo(bytes: Uint8Array): Record<string, SfoValue> {
  if (bytes.length < HEADER_SIZE || MAGIC.some((b, i) => bytes[i] !== b)) {
    throw invalid('signature PSF absente')
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const keyTableStart = view.getUint32(8, true)
  const dataTableStart = view.getUint32(12, true)
  const count = view.getUint32(16, true)
  if (
    HEADER_SIZE + count * INDEX_ENTRY_SIZE > bytes.length ||
    keyTableStart > bytes.length ||
    dataTableStart > bytes.length
  ) {
    throw invalid('tables hors limites')
  }

  const decoder = new TextDecoder('utf-8')
  const out: Record<string, SfoValue> = {}
  for (let i = 0; i < count; i++) {
    const base = HEADER_SIZE + i * INDEX_ENTRY_SIZE
    const keyStart = keyTableStart + view.getUint16(base, true)
    const fmt = view.getUint16(base + 2, true)
    const len = view.getUint32(base + 4, true)
    const dataStart = dataTableStart + view.getUint32(base + 12, true)

    let keyEnd = keyStart
    while (keyEnd < bytes.length && bytes[keyEnd] !== 0) keyEnd++
    if (keyEnd >= bytes.length) throw invalid(`clé n°${i} non terminée`)
    if (dataStart + len > bytes.length) throw invalid(`donnée n°${i} hors limites`)
    const key = decoder.decode(bytes.subarray(keyStart, keyEnd))

    if (fmt === FMT_INT32) {
      if (len < 4) throw invalid(`entier "${key}" tronqué`)
      out[key] = view.getUint32(dataStart, true)
    } else if (fmt === FMT_UTF8 || fmt === FMT_UTF8_SPECIAL) {
      out[key] = decoder.decode(bytes.subarray(dataStart, dataStart + len)).replace(/\0+$/, '')
    }
    // Formats inconnus ignorés : seules TITLE / TITLE_ID nous intéressent.
  }
  return out
}

/** Construit un PARAM.SFO valide (clés triées, tables alignées sur 4 octets). */
export function buildSfo(entries: Record<string, SfoValue>): Uint8Array {
  const enc = new TextEncoder()
  const align4 = (n: number) => (n + 3) & ~3
  const keys = Object.keys(entries).sort()
  const keyBytes = keys.map((k) => enc.encode(k))
  const values = keys.map((k) => {
    const v = entries[k]
    if (typeof v === 'number') return { fmt: FMT_INT32, len: 4, max: 4, num: v, str: null }
    const str = enc.encode(v)
    return { fmt: FMT_UTF8, len: str.length + 1, max: align4(str.length + 1), num: 0, str }
  })

  const keyTableStart = HEADER_SIZE + keys.length * INDEX_ENTRY_SIZE
  const dataTableStart = keyTableStart + align4(keyBytes.reduce((a, k) => a + k.length + 1, 0))
  const buf = new Uint8Array(dataTableStart + values.reduce((a, v) => a + v.max, 0))
  const view = new DataView(buf.buffer)

  buf.set(MAGIC, 0)
  view.setUint32(4, 0x0101, true)
  view.setUint32(8, keyTableStart, true)
  view.setUint32(12, dataTableStart, true)
  view.setUint32(16, keys.length, true)

  let keyOffset = 0
  let dataOffset = 0
  keys.forEach((_, i) => {
    const base = HEADER_SIZE + i * INDEX_ENTRY_SIZE
    const v = values[i]
    view.setUint16(base, keyOffset, true)
    view.setUint16(base + 2, v.fmt, true)
    view.setUint32(base + 4, v.len, true)
    view.setUint32(base + 8, v.max, true)
    view.setUint32(base + 12, dataOffset, true)

    buf.set(keyBytes[i], keyTableStart + keyOffset)
    keyOffset += keyBytes[i].length + 1

    if (v.str) buf.set(v.str, dataTableStart + dataOffset)
    else view.setUint32(dataTableStart + dataOffset, v.num >>> 0, true)
    dataOffset += v.max
  })
  return buf
}

/** Extrait titre + Title ID ; lève une erreur explicite si l'un manque ou est invalide. */
export function readTitleInfo(bytes: Uint8Array): VitaTitleInfo {
  const sfo = parseSfo(bytes)
  const titleId = typeof sfo.TITLE_ID === 'string' ? sfo.TITLE_ID.trim() : ''
  if (!TITLE_ID_RE.test(titleId)) {
    throw invalid(`TITLE_ID absent ou mal formé ("${titleId}")`)
  }
  const rawTitle =
    typeof sfo.TITLE === 'string' ? sfo.TITLE : typeof sfo.STITLE === 'string' ? sfo.STITLE : ''
  const title = rawTitle.replace(/\s+/g, ' ').trim()
  if (!title) throw invalid('TITLE absent')
  return { title, titleId }
}
