import { useEffect, useState } from 'react'
import { DeviceStatus } from '../components/DeviceStatus'
import { ExecutionLog } from '../components/ExecutionLog'
import { OrchestratorModule } from '../components/OrchestratorModule'
import type { AdbDevice } from '../../electron/main/adb/types'
import { useSettings } from '../store/settings'

export function Configure() {
  const [device, setDevice] = useState<AdbDevice | null>(null)
  const { simulationMode, setSimulationMode } = useSettings()

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
          <h2>Configurer ma console</h2>
          <p className="page-desc">
            L'orchestrateur enchaîne tous les modules derrière un unique bouton, puis produit un
            rapport final vérifié.
          </p>
        </div>
        <DeviceStatus />
      </div>

      <div className="page-content page-content--fill">
        {simulationMode ? (
          <div className="mode-banner mode-banner--sim">
            <div className="mode-banner-info">
              <span className="mode-banner-icon">🧪</span>
              <div>
                <div className="mode-banner-title">Mode Simulation actif</div>
                <div className="mode-banner-desc">
                  L'application s'exécute sur une console virtuelle fictive de test.
                  Pour configurer votre console <strong>AYN Thor Max</strong> branchée en USB, désactivez la simulation :
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn--primary mode-banner-action"
              onClick={() => setSimulationMode(false)}
            >
              ⚡ Passer en Mode Réel (Console USB)
            </button>
          </div>
        ) : (
          <div className="mode-banner mode-banner--real">
            <div className="mode-banner-info">
              <span className="mode-banner-icon">⚡</span>
              <div>
                <div className="mode-banner-title">Mode Réel actif (ADB USB)</div>
                <div className="mode-banner-desc">
                  {device
                    ? `Console détectée : ${device.model} (${device.serial}). Prête pour la configuration !`
                    : 'Branchez votre console AYN Thor Max via câble USB avec le Débogage USB activé.'}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn--secondary btn--small"
              onClick={() => setSimulationMode(true)}
              title="Basculer vers la console virtuelle fictive"
            >
              🧪 Mode simulation
            </button>
          </div>
        )}

        <OrchestratorModule device={device} />
        <ExecutionLog />
      </div>
    </div>
  )
}
