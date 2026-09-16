import { useCallback, useEffect, useState } from 'react'
import {
  checkUpdates,
  isObtainiumInstalled,
  makeDefaultUpdatesIpc,
  updateEmulator,
  type UpdateStatus,
} from '../modules/emulators/updates'
import { useAuditLog } from '../store/auditLog'
import { useSettings } from '../store/settings'
import type { AdbDevice } from '../../electron/main/adb/types'

interface Props {
  device: AdbDevice | null
}

const BADGE: Record<UpdateStatus['state'], { label: (s: UpdateStatus) => string; className: string }> = {
  'up-to-date': { label: () => 'À jour', className: 'status-pill--success' },
  'update-available': {
    label: (s) => `Mise à jour disponible : ${s.latestVersion}`,
    className: 'status-pill--partial',
  },
  'not-installed': { label: () => 'Non installé', className: 'status-pill--skipped' },
  manual: { label: () => 'Google Play — mise à jour manuelle', className: 'status-pill--skipped' },
  unknown: { label: () => 'Version non vérifiable', className: 'status-pill--skipped' },
}

/** Section « Mises à jour » : état par émulateur + relance du pipeline d'installation. */
export function EmulatorUpdates({ device }: Props) {
  const { simulationMode } = useSettings()
  const addStep = useAuditLog((s) => s.addStep)
  const [statuses, setStatuses] = useState<UpdateStatus[] | null>(null)
  const [checking, setChecking] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [obtainium, setObtainium] = useState(false)

  const refresh = useCallback(async () => {
    if (!device) return
    setChecking(true)
    try {
      const ipc = makeDefaultUpdatesIpc()
      setObtainium(await isObtainiumInstalled(device.serial, ipc))
      setStatuses(await checkUpdates(device.serial, ipc))
    } finally {
      setChecking(false)
    }
  }, [device])

  useEffect(() => {
    setStatuses(null)
    void refresh()
  }, [refresh, simulationMode])

  async function runUpdate(list: UpdateStatus[]) {
    if (!device || busyId) return
    const options = simulationMode ? { maxRetries: 1, retryDelayMs: 0 } : {}
    for (const status of list) {
      setBusyId(status.source.id)
      await updateEmulator(device.serial, status.source, makeDefaultUpdatesIpc(), addStep, options)
    }
    setBusyId(null)
    await refresh()
  }

  const updatable = (statuses ?? []).filter((s) => s.state === 'update-available')

  return (
    <div className="card">
      <div className="card-header">
        <h3>Mises à jour</h3>
        <p className="card-desc">
          Compare la version installée sur la console (<code>dumpsys package</code>) à la dernière version
          publiée sur GitHub ou F-Droid. La mise à jour réutilise le même pipeline vérifié que
          l'installation.
        </p>
        {obtainium && (
          <p className="hint">
            Obtainium gère les mises à jour automatiquement en arrière-plan — les boutons ci-dessous
            restent disponibles pour forcer une mise à jour tout de suite.
          </p>
        )}
      </div>

      <div className="card-body">
        {!device ? (
          <p className="hint">Aucune console détectée.</p>
        ) : statuses === null ? (
          <p className="hint">
            <span className="spinner" /> Vérification des versions…
          </p>
        ) : (
          <div className="update-list">
            {statuses.map((s) => (
              <div key={s.source.id} className="update-row">
                <span className="update-row__name">{s.source.displayName}</span>
                <span className="hint update-row__version">
                  {s.installedVersion ? `installée : ${s.installedVersion}` : '—'}
                </span>
                <span className={`status-pill ${BADGE[s.state].className}`} title={s.error}>
                  {BADGE[s.state].label(s)}
                </span>
                <button
                  className="btn-ghost btn-sm"
                  disabled={busyId !== null || s.state === 'manual' || s.state === 'unknown'}
                  onClick={() => runUpdate([s])}
                >
                  {busyId === s.source.id && <span className="spinner" />}
                  {s.state === 'not-installed' ? 'Installer' : 'Mettre à jour'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="card-footer">
        <button
          className="btn-primary"
          disabled={!device || busyId !== null || updatable.length === 0}
          onClick={() => runUpdate(updatable)}
        >
          {busyId !== null && <span className="spinner" />}
          Tout mettre à jour{updatable.length > 0 ? ` (${updatable.length})` : ''}
        </button>
        <button className="btn-ghost btn-sm" disabled={!device || checking} onClick={refresh}>
          Revérifier
        </button>
      </div>
    </div>
  )
}
