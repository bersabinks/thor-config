import { useState } from 'react'
import { runVerifiedAction } from '../verification'
import { useAuditLog } from '../store/auditLog'
import type { AdbDevice } from '../../electron/main/adb/types'

interface Props {
  device: AdbDevice | null
}

type TestState = 'idle' | 'running' | 'done'

export function ScreenWakeTest({ device }: Props) {
  const [state, setState] = useState<TestState>('idle')
  const [lastStatus, setLastStatus] = useState<'success' | 'failed_after_retries' | null>(null)
  const addStep = useAuditLog((s) => s.addStep)

  async function handleTest() {
    if (!device || state === 'running') return
    setState('running')

    const serial = device.serial

    const result = await runVerifiedAction({
      label: "Vérifier que l'écran est allumé",
      apply: async () => {
        await window.electronAPI.adb.shell(serial, 'input keyevent KEYCODE_WAKEUP')
      },
      check: async () => {
        return await window.electronAPI.adb.shell(serial, 'dumpsys power | grep mWakefulness')
      },
      expected: (output: string) => output.includes('Awake'),
      maxRetries: 3,
      retryDelayMs: 500,
    })

    addStep(result)
    setLastStatus(result.status)
    setState('done')
  }

  const buttonText =
    state === 'running'
      ? 'Test en cours…'
      : state === 'done'
      ? 'Retester'
      : "Vérifier que l'écran est allumé"

  return (
    <div className="card">
      <div className="card-header">
        <h3>Test de connectivité ADB</h3>
        <p className="card-desc">
          Réveille l'écran via ADB et vérifie que la console répond correctement.
        </p>
      </div>
      <div className="card-body">
        <button
          className="btn-primary"
          onClick={handleTest}
          disabled={!device || state === 'running'}
        >
          {state === 'running' ? <span className="spinner" /> : null}
          {buttonText}
        </button>

        {!device && (
          <p className="hint">Aucun appareil détecté. Activez le mode simulation dans Réglages.</p>
        )}

        {lastStatus && (
          <div className={`result-badge result-badge--${lastStatus === 'success' ? 'success' : 'error'}`}>
            {lastStatus === 'success' ? '✓ Succès — écran éveillé confirmé' : '✗ Échec après tous les essais'}
          </div>
        )}
      </div>
    </div>
  )
}
