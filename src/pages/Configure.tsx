import { useEffect, useState } from 'react'
import { DeviceStatus } from '../components/DeviceStatus'
import { ExecutionLog } from '../components/ExecutionLog'
import { OrchestratorModule } from '../components/OrchestratorModule'
import type { AdbDevice } from '../../electron/main/adb/types'
import type { AdbInfo } from '../types/electron'
import type { Page } from '../components/Sidebar'
import { useSettings } from '../store/settings'

export interface ConfigureProps {
  onNavigate?: (page: Page) => void
}

function formatAdbSource(source: string | null): string {
  switch (source) {
    case 'custom':
      return 'chemin personnalisé'
    case 'winget':
      return 'winget'
    case 'chocolatey':
      return 'chocolatey'
    case 'internal':
      return 'interne'
    case 'path':
      return 'PATH'
    case 'env':
      return 'ADB_PATH'
    case 'sdk':
      return 'Android SDK'
    case 'manual':
      return 'standard'
    default:
      return source ?? 'détecté'
  }
}

export function Configure({ onNavigate }: ConfigureProps = {}) {
  const [device, setDevice] = useState<AdbDevice | null>(null)
  const [adbInfo, setAdbInfo] = useState<AdbInfo | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const { simulationMode, setSimulationMode } = useSettings()

  useEffect(() => {
    let active = true

    async function poll() {
      try {
        if (window.electronAPI?.adb?.getAdbInfo) {
          const info = await window.electronAPI.adb.getAdbInfo()
          if (active) setAdbInfo(info)
        }
        if (window.electronAPI?.adb?.listDevices) {
          const devices = await window.electronAPI.adb.listDevices()
          if (active) setDevice(devices[0] ?? null)
        }
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

  async function handleRefresh() {
    setIsRefreshing(true)
    try {
      if (window.electronAPI?.adb?.getAdbInfo) {
        const info = await window.electronAPI.adb.getAdbInfo()
        setAdbInfo(info)
      }
      if (window.electronAPI?.adb?.listDevices) {
        const devices = await window.electronAPI.adb.listDevices()
        setDevice(devices[0] ?? null)
      }
    } catch {
      setDevice(null)
    } finally {
      setIsRefreshing(false)
    }
  }

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

      <div className="page-content">
        {/* Barre de statut ADB & Bouton Rafraîchir */}
        {adbInfo && (
          <div className={`adb-status-bar ${adbInfo.found ? 'adb-status-bar--ok' : 'adb-status-bar--error'}`}>
            <div className="adb-status-bar__info">
              <span className="adb-status-bar__icon">{adbInfo.found ? '✓' : '⚠️'}</span>
              <div className="adb-status-bar__text">
                {adbInfo.found ? (
                  <>
                    <span className="adb-status-bar__title">ADB :</span>
                    <code className="adb-status-bar__path">{adbInfo.path}</code>
                    <span className="adb-status-bar__source">({formatAdbSource(adbInfo.source)})</span>
                  </>
                ) : (
                  <span className="adb-status-bar__title">
                    ADB introuvable — configurez le chemin dans Réglages
                  </span>
                )}
              </div>
            </div>
            <div className="adb-status-bar__actions">
              {!adbInfo.found && onNavigate && (
                <button
                  type="button"
                  className="btn btn--primary btn--small"
                  onClick={() => onNavigate('settings')}
                >
                  ⚙ Aller aux Réglages
                </button>
              )}
              <button
                type="button"
                className="btn btn--secondary btn--small"
                onClick={handleRefresh}
                disabled={isRefreshing}
                title="Relancer la détection d'ADB et de la console sans redémarrer l'application"
              >
                {isRefreshing ? '⏳ Détection…' : '🔄 Rafraîchir'}
              </button>
            </div>
          </div>
        )}

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

