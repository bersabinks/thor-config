import { describe, it, expect, vi } from 'vitest'
import { runVerifiedAction } from '../index'

describe('runVerifiedAction — comportement de base', () => {
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
    expect(result.attempts).toBe(3) // 1 initial + 2 retries
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

describe('runVerifiedAction — gestion des exceptions dans apply()', () => {
  it('retrie quand apply() lance une exception, et réussit au 3e essai', async () => {
    let callCount = 0
    const result = await runVerifiedAction({
      label: 'Test apply throws then succeeds',
      apply: vi.fn().mockImplementation(async () => {
        callCount++
        if (callCount < 3) throw new Error('not ready yet')
      }),
      check: vi.fn().mockResolvedValue('ok'),
      expected: (v: string) => v === 'ok',
      maxRetries: 3,
      retryDelayMs: 0,
    })
    expect(result.status).toBe('success')
    expect(result.attempts).toBe(3)
  })

  it('retourne failed_after_retries avec error quand apply() échoue toujours', async () => {
    const result = await runVerifiedAction({
      label: 'Test always throws',
      apply: async () => { throw new Error('connection refused') },
      check: async () => 'ok',
      expected: () => true,
      maxRetries: 1,
      retryDelayMs: 0,
    })
    expect(result.status).toBe('failed_after_retries')
    expect(result.attempts).toBe(2) // 1 initial + 1 retry
    expect(result.error).toContain('connection refused')
    expect(result.error).toContain('apply()')
  })

  it('consomme tous les maxRetries quand apply() lance une exception', async () => {
    const apply = vi.fn().mockRejectedValue(new Error('fail'))
    const result = await runVerifiedAction({
      label: 'Test max retries on throw',
      apply,
      check: vi.fn().mockResolvedValue('ok'),
      expected: () => true,
      maxRetries: 2,
      retryDelayMs: 0,
    })
    expect(result.status).toBe('failed_after_retries')
    expect(apply).toHaveBeenCalledTimes(3) // 1 + 2 retries
    expect(result.attempts).toBe(3)
  })
})

describe('runVerifiedAction — messages d\'erreur lisibles', () => {
  it('inclut expectedDescription dans le message d\'erreur', async () => {
    const result = await runVerifiedAction({
      label: 'Test expected desc',
      apply: async () => {},
      check: async () => false,
      expected: (v: boolean) => v,
      expectedDescription: '"Xbox" sélectionné dans AYN Settings',
      maxRetries: 0,
      retryDelayMs: 0,
    })
    expect(result.status).toBe('failed_after_retries')
    expect(result.error).toContain('"Xbox" sélectionné dans AYN Settings')
    expect(result.error).toContain('false')
  })

  it('fournit un message d\'erreur même sans expectedDescription', async () => {
    const result = await runVerifiedAction({
      label: 'Test no desc',
      apply: async () => {},
      check: async () => 'wrong',
      expected: () => false,
      maxRetries: 0,
      retryDelayMs: 0,
    })
    expect(result.error).toBeDefined()
    expect(result.error).toContain('wrong')
  })

  it('pas de champ error sur un résultat succès', async () => {
    const result = await runVerifiedAction({
      label: 'Test success no error',
      apply: async () => {},
      check: async () => true,
      expected: (v: boolean) => v,
      maxRetries: 0,
      retryDelayMs: 0,
    })
    expect(result.status).toBe('success')
    expect(result.error).toBeUndefined()
  })
})
