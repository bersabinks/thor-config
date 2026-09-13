export interface StepResult {
  label: string
  status: 'success' | 'failed_after_retries'
  attempts: number
  lastValue: unknown
  error?: string
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
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Exécute une action puis vérifie son résultat, avec retry+backoff.
 * Les exceptions levées par apply() ou check() sont catchées et entraînent un retry
 * plutôt qu'une remontée immédiate — ce qui garantit que maxRetries est bien respecté.
 */
export async function runVerifiedAction<T>(
  options: RunVerifiedActionOptions<T>
): Promise<StepResult> {
  const { label, apply, check, expected, expectedDescription, maxRetries, retryDelayMs } = options

  let lastValue: T | undefined
  let lastError: string | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // ── apply() ─────────────────────────────────────────────────
    try {
      await apply()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[${label}] apply() a échoué (tentative ${attempt + 1}): ${msg}`)
      lastError = `apply() a échoué : ${msg}`
      if (attempt < maxRetries) {
        await sleep(retryDelayMs * (attempt + 1))
        continue
      }
      return {
        label,
        status: 'failed_after_retries',
        attempts: attempt + 1,
        lastValue: undefined,
        error: lastError,
        timestamp: Date.now(),
      }
    }

    await sleep(retryDelayMs)

    // ── check() ─────────────────────────────────────────────────
    try {
      lastValue = await check()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn(`[${label}] check() a échoué (tentative ${attempt + 1}): ${msg}`)
      lastError = `check() a échoué : ${msg}`
      if (attempt < maxRetries) {
        await sleep(retryDelayMs * (attempt + 1))
        continue
      }
      return {
        label,
        status: 'failed_after_retries',
        attempts: attempt + 1,
        lastValue: undefined,
        error: lastError,
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
