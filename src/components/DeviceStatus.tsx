import { useEffect, useState } from 'react'
import type { AdbDevice } from '../../electron/main/adb/types'
import { describeError, parseAdbErrorCode, type AdbErrorCode } from '../../electron/main/adb/errors'
import { useSettings } from '../store/settings'

export function DeviceStatus() {
  const [device, setDevice] = useState<AdbDevice | null>(null)
  const [adbError, setAdbError] = useState<{ message: string; code: AdbErrorCode | null } | null>(null)
  const { simulationMode } = useSettings()

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
  const label = device
    ? device.state === 'unauthorized'
      ? `${device.model} — autorisez le débogage USB`
      : device.model
    : adbError
    ? adbError.code === 'ADB_NOT_FOUND'
      ? 'ADB introuvable — voir README'
      : 'ADB indisponible'
    : simulationMode
    ? 'Aucun appareil simulé'
    : 'Aucun appareil connecté'

  return (
    <div className="device-status" title={adbError?.message}>
      <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
      <span className="status-label">{label}</span>
      {simulationMode && (
        <span className="sim-badge">SIMULATION</span>
      )}
    </div>
  )
}
