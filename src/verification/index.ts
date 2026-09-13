export interface StepResult {
  label: string
  status: 'success' | 'failed_after_retries'
  attempts: number
  lastValue: unknown
  timestamp: number
}

export interface RunVerifiedActionOptions<T> {
  label: string
  apply: () => Promise<void>
  check: () => Promise<T>
  expected: (result: T) => boolean
  maxRetries: number
  retryDelayMs: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function runVerifiedAction<T>(
  options: RunVerifiedActionOptions<T>
): Promise<StepResult> {
  const { label, apply, check, expected, maxRetries, retryDelayMs } = options

  let lastValue: T | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    await apply()
    await sleep(retryDelayMs)
    lastValue = await check()

    console.log(`[${label}] attempt ${attempt + 1}/${maxRetries + 1}: value =`, lastValue)

    if (expected(lastValue)) {
      return { label, status: 'success', attempts: attempt + 1, lastValue, timestamp: Date.now() }
    }

    if (attempt < maxRetries) {
      // backoff exponentiel : délai × (tentative+1)
      await sleep(retryDelayMs * (attempt + 1))
    }
  }

  return {
    label,
    status: 'failed_after_retries',
    attempts: maxRetries + 1,
    lastValue,
    timestamp: Date.now(),
  }
}
