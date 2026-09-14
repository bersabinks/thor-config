import { useEffect, useState } from 'react'
import { DeviceStatus } from '../components/DeviceStatus'
import { ExecutionLog } from '../components/ExecutionLog'
import { LauncherModule } from '../components/LauncherModule'
import type { AdbDevice } from '../../electron/main/adb/types'
import { useSettings } from '../store/settings'

export function Launcher() {
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

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Launcher</h2>
          <p className="page-desc">
            Définit le launcher comme application Home par défaut et vérifie qu'il est actif.
          </p>
        </div>
        <DeviceStatus />
      </div>

      <div className="page-content page-content--fill">
        <LauncherModule device={device} />
        <ExecutionLog />
      </div>
    </div>
  )
}
