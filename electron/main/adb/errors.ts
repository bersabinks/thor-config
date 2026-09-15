/**
 * Erreurs ADB normalisées, partagées entre le process main et le renderer
 * (aucune dépendance à Electron ni à Node).
 *
 * Electron ne transmet à travers l'IPC que le *message* d'une erreur : le code
 * est donc encodé en tête du message (`[ADB:TIMEOUT] …`) et relu côté renderer
 * par `parseAdbErrorCode`, ce qui permet au moteur de vérification de décider
 * s'il faut retenter ou non.
 */

export type AdbErrorCode =
  | 'ADB_NOT_FOUND'
  | 'DEVICE_DISCONNECTED'
  | 'DEVICE_OFFLINE'
  | 'DEVICE_UNAUTHORIZED'
  | 'TIMEOUT'
  | 'PERMISSION_DENIED'
  | 'COMMAND_FAILED'

interface AdbErrorInfo {
  /** Un nouvel essai automatique a-t-il une chance d'aboutir ? */
  retryable: boolean
  /** Message lisible par le testeur, avec l'action à mener. */
  message: string
}

export const ADB_ERROR_INFO: Record<AdbErrorCode, AdbErrorInfo> = {
  ADB_NOT_FOUND: {
    retryable: false,
    message:
      'ADB introuvable sur ce PC : installez les Android platform-tools (voir README) ou renseignez la variable d’environnement ADB_PATH.',
  },
  DEVICE_DISCONNECTED: {
    retryable: true,
    message: 'Console déconnectée pendant l’opération — vérifiez le câble USB.',
  },
  DEVICE_OFFLINE: {
    retryable: true,
    message: 'Console hors ligne — débranchez puis rebranchez le câble USB.',
  },
  DEVICE_UNAUTHORIZED: {
    retryable: false,
    message:
      'Débogage USB non autorisé — acceptez la demande d’autorisation affichée sur l’écran de la console.',
  },
  TIMEOUT: {
    retryable: true,
    message: 'Délai dépassé — la console ne répond pas.',
  },
  PERMISSION_DENIED: {
    retryable: false,
    message: 'Permission refusée par Android (dossier protégé ou accès root requis).',
  },
  COMMAND_FAILED: {
    retryable: true,
    message: 'La commande ADB a échoué.',
  },
}

const TAG_RE = /\[ADB:([A-Z_]+)\]/
const MAX_DETAIL = 300

function oneLine(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > MAX_DETAIL ? `${flat.slice(0, MAX_DETAIL)}…` : flat
}

export class AdbError extends Error {
  readonly code: AdbErrorCode
  readonly retryable: boolean
  /** Sortie brute d'adb (stderr/stdout), tronquée. */
  readonly detail: string

  constructor(code: AdbErrorCode, detail = '', message = ADB_ERROR_INFO[code].message) {
    const d = oneLine(detail)
    super(`[ADB:${code}] ${message}${d ? ` (${d})` : ''}`)
    this.name = 'AdbError'
    this.code = code
    this.retryable = ADB_ERROR_INFO[code].retryable
    this.detail = d
  }
}

/** Échec tel que renvoyé par `child_process.execFile` (champs utiles uniquement). */
export interface ExecFailure {
  code?: string | number | null
  killed?: boolean
  signal?: string | null
  stdout?: string
  stderr?: string
  message?: string
}

// Ordre significatif : l'état de l'appareil prime sur la permission.
const PATTERNS: ReadonlyArray<[AdbErrorCode, RegExp]> = [
  ['DEVICE_UNAUTHORIZED', /unauthorized/i],
  ['DEVICE_OFFLINE', /device offline/i],
  [
    'DEVICE_DISCONNECTED',
    /device (?:'[^']*' )?not found|no devices\/emulators found|error: closed|protocol fault|connection reset|device still connecting|no such device/i,
  ],
  [
    'PERMISSION_DENIED',
    /permission denied|operation not permitted|read-only file system|securityexception|INSTALL_FAILED_USER_RESTRICTED/i,
  ],
]

/**
 * Traduit l'échec d'un appel au binaire adb en AdbError typée. `timeoutMs`
 * sert uniquement à rendre le message de délai dépassé explicite.
 */
export function classifyAdbFailure(failure: ExecFailure, timeoutMs?: number): AdbError {
  const output = [failure.stderr, failure.stdout].filter(Boolean).join(' ').trim()
  const detail = output || failure.message || ''

  if (failure.code === 'ENOENT') return new AdbError('ADB_NOT_FOUND', detail)

  const maxBuffer = failure.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER'
  if (!maxBuffer && (failure.killed || failure.code === 'ETIMEDOUT')) {
    const secs = timeoutMs ? ` (${Math.round(timeoutMs / 1000)} s)` : ''
    return new AdbError('TIMEOUT', detail, `Délai dépassé${secs} — la console ne répond pas.`)
  }

  // On cherche dans la sortie d'adb, pas dans `message` qui recopie la commande
  // (une commande contenant « unauthorized » ne doit pas être mal classée).
  const haystack = output || failure.message || ''
  for (const [code, re] of PATTERNS) {
    if (re.test(haystack)) return new AdbError(code, detail)
  }
  return new AdbError('COMMAND_FAILED', detail)
}

/** Code ADB d'une erreur, y compris après passage par l'IPC Electron. */
export function parseAdbErrorCode(err: unknown): AdbErrorCode | null {
  if (err instanceof AdbError) return err.code
  const msg = err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  const m = TAG_RE.exec(msg)
  return m && m[1] in ADB_ERROR_INFO ? (m[1] as AdbErrorCode) : null
}

/** Faux uniquement pour les erreurs ADB qu'un nouvel essai ne peut pas corriger. */
export function isRetryableError(err: unknown): boolean {
  const code = parseAdbErrorCode(err)
  return code === null ? true : ADB_ERROR_INFO[code].retryable
}

/**
 * Message lisible d'une erreur quelconque : retire le préfixe ajouté par l'IPC
 * Electron (« Error invoking remote method 'adb:shell': AdbError: ») et le tag
 * technique `[ADB:CODE]`.
 */
export function describeError(err: unknown): string {
  let msg = err instanceof Error ? err.message : String(err)
  msg = msg.replace(/^Error invoking remote method '[^']*':\s*(?:\w*Error:\s*)?/, '')
  msg = msg.replace(TAG_RE, '')
  return msg.trim()
}
