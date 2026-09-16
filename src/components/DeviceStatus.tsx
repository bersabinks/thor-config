import { useEffect, useState } from 'react'
import type { AdbDevice } from '../../electron/main/adb/types'
import type { AdbSetupState } from '../../electron/main/adb/platformTools'
import { describeError, parseAdbErrorCode, type AdbErrorCode } from '../../electron/main/adb/errors'
import { useSettings } from '../store/settings'

/** Indicateur Zero-Setup ADB : visible seulement quand ThorConfig gère adb lui-même. */
function AdbSetupBadge({ state, onRetry }: { state: AdbSetupState; onRetry: () => void }) {
  switch (state.phase) {
    case 'downloading': {
      const progress =
        state.totalBytes !== null
          ? `${Math.round((state.receivedBytes / state.totalBytes) * 100)} %`
          : `${(state.receivedBytes / (1024 * 1024)).toFixed(1)} Mio`
      return (
        <span className="adb-badge adb-badge--busy" title="Téléchargement des Android platform-tools officiels (Google)">
          Téléchargement d’ADB… {progress}
        </span>
      )
    }
    case 'extracting':
      return <span className="adb-badge adb-badge--busy">Installation d’ADB…</span>
    case 'ready':
      return (
        <span className="adb-badge adb-badge--ok" title={`${state.version}\n${state.path}`}>
          ADB intégré
        </span>
      )
    case 'error':
      return (
        <span className="adb-badge adb-badge--error" title={state.message}>
          ADB non installé
          <button className="adb-badge__retry" onClick={onRetry}>
            Réessayer
          </button>
        </span>
      )
    default:
      return null
  }
}

export function DeviceStatus() {
  const [device, setDevice] = useState<AdbDevice | null>(null)
  const [adbError, setAdbError] = useState<{ message: string; code: AdbErrorCode | null } | null>(null)
  const [setup, setSetup] = useState<AdbSetupState | null>(null)
  const { simulationMode } = useSettings()

  useEffect(() => {
    let active = true
    window.electronAPI.adb
      .getSetupState()
      .then((s) => active && setSetup(s))
      .catch(() => {})
    const unsubscribe = window.electronAPI.adb.onSetupState(setSetup)
    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    let active = true

    async function poll() {
      try {
        const devices = await window.electronAPI.adb.listDevices()
        if (active) {
          setDevice(devices[0] ?? null)
          setAdbError(null)
        }
      } catch (err) {
        if (active) {
          setDevice(null)
          setAdbError({ message: describeError(err), code: parseAdbErrorCode(err) })
        }
      }
    }

    poll()
    const interval = setInterval(poll, 2000)
    return () => {
      active = false
      clearInterval(interval)
    }
  }, [simulationMode])

  const connected = device !== null
  const installing = setup?.phase === 'downloading' || setup?.phase === 'extracting'
  const label = device
    ? device.state === 'unauthorized'
      ? `${device.model} — autorisez le débogage USB`
      : device.model
    : adbError
    ? installing
      ? 'En attente d’ADB'
      : adbError.code === 'ADB_NOT_FOUND'
      ? 'ADB introuvable — voir README'
      : 'ADB indisponible'
    : simulationMode
    ? 'Aucun appareil simulé'
    : 'Aucun appareil connecté'

  return (
    <div className="device-status" title={adbError?.message}>
      <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
      <span className="status-label">{label}</span>
      {setup && (
        <AdbSetupBadge
          state={setup}
          onRetry={() => {
            window.electronAPI.adb.retrySetup().then(setSetup).catch(() => {})
          }}
        />
      )}
      {simulationMode && (
        <span className="sim-badge">SIMULATION</span>
      )}
    </div>
  )
}
