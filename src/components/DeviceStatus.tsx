import { useEffect, useState } from 'react'
import type { AdbDevice } from '../../electron/main/adb/types'
import { useSettings } from '../store/settings'

export function DeviceStatus() {
  const [device, setDevice] = useState<AdbDevice | null>(null)
  const { simulationMode } = useSettings()

  useEffect(() => {
    let active = true

    async function poll() {
      try {
        const devices = await window.electronAPI.adb.listDevices()
        if (active) setDevice(devices[0] ?? null)
      } catch {
        if (active) setDevice(null)
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
    ? device.model
    : simulationMode
    ? 'Aucun appareil simulé'
    : 'Aucun appareil connecté'

  return (
    <div className="device-status">
      <span className={`status-dot ${connected ? 'connected' : 'disconnected'}`} />
      <span className="status-label">{label}</span>
      {simulationMode && (
        <span className="sim-badge">SIMULATION</span>
      )}
    </div>
  )
}
