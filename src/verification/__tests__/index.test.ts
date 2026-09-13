import { describe, it, expect, vi } from 'vitest'
import { runVerifiedAction } from '../index'

describe('runVerifiedAction', () => {
  it('returns success on first attempt when expected passes', async () => {
    const result = await runVerifiedAction({
      label: 'Test écran allumé',
      apply: vi.fn().mockResolvedValue(undefined),
      check: vi.fn().mockResolvedValue('mWakefulness=Awake'),
      expected: (v: string) => v.includes('Awake'),
      maxRetries: 3,
      retryDelayMs: 0,
    })

    expect(result.status).toBe('success')
    expect(result.attempts).toBe(1)
    expect(result.label).toBe('Test écran allumé')
    expect(result.lastValue).toBe('mWakefulness=Awake')
  })

  it('retries and succeeds on the second attempt', async () => {
    let callCount = 0
    const result = await runVerifiedAction({
      label: 'Test retry',
      apply: vi.fn().mockResolvedValue(undefined),
      check: vi.fn().mockImplementation(async () => {
        callCount++
        return callCount >= 2 ? 'mWakefulness=Awake' : 'mWakefulness=Asleep'
      }),
      expected: (v: string) => v.includes('Awake'),
      maxRetries: 3,
      retryDelayMs: 0,
    })

    expect(result.status).toBe('success')
    expect(result.attempts).toBe(2)
  })

  it('returns failed_after_retries when all attempts fail', async () => {
    const result = await runVerifiedAction({
      label: 'Test échec',
      apply: vi.fn().mockResolvedValue(undefined),
      check: vi.fn().mockResolvedValue('mWakefulness=Asleep'),
      expected: (v: string) => v.includes('Awake'),
      maxRetries: 2,
      retryDelayMs: 0,
    })

    expect(result.status).toBe('failed_after_retries')
    // 1 initial + 2 retries = 3 total
    expect(result.attempts).toBe(3)
    expect(result.lastValue).toBe('mWakefulness=Asleep')
  })

  it('calls apply() on every attempt', async () => {
    const apply = vi.fn().mockResolvedValue(undefined)
    await runVerifiedAction({
      label: 'Test apply',
      apply,
      check: vi.fn().mockResolvedValue('fail'),
      expected: () => false,
      maxRetries: 2,
      retryDelayMs: 0,
    })
    expect(apply).toHaveBeenCalledTimes(3)
  })

  it('includes a timestamp in the result', async () => {
    const before = Date.now()
    const result = await runVerifiedAction({
      label: 'Test timestamp',
      apply: vi.fn().mockResolvedValue(undefined),
      check: vi.fn().mockResolvedValue('Awake'),
      expected: () => true,
      maxRetries: 0,
      retryDelayMs: 0,
    })
    expect(result.timestamp).toBeGreaterThanOrEqual(before)
    expect(result.timestamp).toBeLessThanOrEqual(Date.now())
  })
})
