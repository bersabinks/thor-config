import { describe, it, expect, vi } from 'vitest'
import { runVerifiedAction } from '../index'
import { AdbError, type AdbErrorCode } from '../../../electron/main/adb/errors'

/** Erreur telle que reçue par le renderer après `ipcRenderer.invoke`. */
function ipcError(code: AdbErrorCode): Error {
  return new Error(`Error invoking remote method 'adb:shell': ${String(new AdbError(code, 'détail adb'))}`)
}

const base = { label: 'étape', retryDelayMs: 0, maxRetries: 2, expected: (v: string) => v === 'ok' }

describe('runVerifiedAction — erreurs ADB', () => {
  it('permission refusée : échec immédiat, sans nouvel essai', async () => {
    const apply = vi.fn().mockRejectedValue(ipcError('PERMISSION_DENIED'))
    const res = await runVerifiedAction({ ...base, apply, check: async () => 'ok' })

    expect(apply).toHaveBeenCalledTimes(1)
    expect(res.status).toBe('failed_after_retries')
    expect(res.attempts).toBe(1)
    expect(res.errorCode).toBe('PERMISSION_DENIED')
    expect(res.error).toMatch(/^apply\(\) a échoué : Permission refusée/)
    expect(res.error).toContain('pas de nouvel essai')
    expect(res.error).not.toMatch(/Error invoking|\[ADB:/)
  })

  it('débogage USB non autorisé et adb absent ne sont pas retentés non plus', async () => {
    for (const code of ['DEVICE_UNAUTHORIZED', 'ADB_NOT_FOUND'] as const) {
      const check = vi.fn().mockRejectedValue(ipcError(code))
      const res = await runVerifiedAction({ ...base, apply: async () => {}, check })
      expect(check).toHaveBeenCalledTimes(1)
      expect(res.errorCode).toBe(code)
    }
  })

  it('timeout passager : retenté puis succès', async () => {
    const check = vi
      .fn()
      .mockRejectedValueOnce(ipcError('TIMEOUT'))
      .mockRejectedValueOnce(ipcError('TIMEOUT'))
      .mockResolvedValue('ok')
    const res = await runVerifiedAction({ ...base, apply: async () => {}, check })

    expect(res.status).toBe('success')
    expect(res.attempts).toBe(3)
    expect(res.errorCode).toBeUndefined()
  })

  it('déconnexion persistante : tous les essais consommés, code conservé', async () => {
    const apply = vi.fn().mockRejectedValue(ipcError('DEVICE_DISCONNECTED'))
    const res = await runVerifiedAction({ ...base, apply, check: async () => 'ok' })

    expect(apply).toHaveBeenCalledTimes(3)
    expect(res.attempts).toBe(3)
    expect(res.errorCode).toBe('DEVICE_DISCONNECTED')
    expect(res.error).toContain('Console déconnectée')
    expect(res.error).not.toContain('pas de nouvel essai')
  })

  it('isRetryable peut être surchargé par un module', async () => {
    const apply = vi.fn().mockRejectedValue(new Error('fichier corrompu'))
    const res = await runVerifiedAction({
      ...base,
      apply,
      check: async () => 'ok',
      isRetryable: () => false,
    })
    expect(apply).toHaveBeenCalledTimes(1)
    expect(res.errorCode).toBeUndefined()
  })
})
