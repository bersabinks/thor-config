import {
  describeError,
  isRetryableError,
  parseAdbErrorCode,
  type AdbErrorCode,
} from '../../electron/main/adb/errors'

export interface StepResult {
  label: string
  status: 'success' | 'failed_after_retries' | 'skipped'
  attempts: number
  lastValue: unknown
  error?: string
  /** Code ADB normalisé quand l'échec vient d'une commande ADB (déconnexion, timeout…). */
  errorCode?: AdbErrorCode
  /** Message d'explication — ex. raison pour laquelle une étape est ignorée (skipped). */
  note?: string
  timestamp: number
}

export interface RunVerifiedActionOptions<T> {
  label: string
  apply: () => Promise<void>
  check: () => Promise<T>
  expected: (result: T) => boolean
  /** Description humaine de la valeur attendue, affichée dans le message d'erreur */
  expectedDescription?: string
  maxRetries: number
  retryDelayMs: number
  /**
   * Une exception mérite-t-elle un nouvel essai ? Par défaut : oui, sauf les
   * erreurs ADB qu'un retry ne peut pas corriger (permission refusée, adb
   * absent, débogage USB non autorisé).
   */
  isRetryable?: (err: unknown) => boolean
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Exécute une action puis vérifie son résultat, avec retry+backoff.
 * Les exceptions levées par apply() ou check() sont catchées et entraînent un retry
 * plutôt qu'une remontée immédiate — ce qui garantit que maxRetries est bien respecté —
 * sauf erreur non récupérable, qui échoue tout de suite avec un message explicite.
 */
export async function runVerifiedAction<T>(
  options: RunVerifiedActionOptions<T>
): Promise<StepResult> {
  const { label, apply, check, expected, expectedDescription, maxRetries, retryDelayMs } = options
  const isRetryable = options.isRetryable ?? isRetryableError

  let lastValue: T | undefined
  let lastError: string | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let phase: 'apply' | 'check' = 'apply'
    try {
      await apply()
      await sleep(retryDelayMs)
      phase = 'check'
      lastValue = await check()
    } catch (err) {
      const msg = describeError(err)
      const retryable = isRetryable(err)
      console.warn(`[${label}] ${phase}() a échoué (tentative ${attempt + 1}): ${msg}`)
      lastError = `${phase}() a échoué : ${msg}`
      if (retryable && attempt < maxRetries) {
        await sleep(retryDelayMs * (attempt + 1))
        continue
      }
      const errorCode = parseAdbErrorCode(err)
      return {
        label,
        status: 'failed_after_retries',
        attempts: attempt + 1,
        lastValue: undefined,
        error: retryable ? lastError : `${lastError} — erreur non récupérable, pas de nouvel essai.`,
        ...(errorCode ? { errorCode } : {}),
        timestamp: Date.now(),
      }
    }

    console.log(`[${label}] tentative ${attempt + 1}/${maxRetries + 1}: valeur =`, lastValue)

    if (expected(lastValue)) {
      return { label, status: 'success', attempts: attempt + 1, lastValue, timestamp: Date.now() }
    }

    lastError = expectedDescription
      ? `Attendu : ${expectedDescription}. Obtenu : ${JSON.stringify(lastValue)}`
      : `Obtenu : ${JSON.stringify(lastValue)}`

    if (attempt < maxRetries) {
      await sleep(retryDelayMs * (attempt + 1))
    }
  }

  return {
    label,
    status: 'failed_after_retries',
    attempts: maxRetries + 1,
    lastValue,
    error: lastError,
    timestamp: Date.now(),
  }
}
