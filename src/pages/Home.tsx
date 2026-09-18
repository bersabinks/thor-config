import { useEffect, useState } from 'react'
import { DeviceStatus } from '../components/DeviceStatus'
import { ExecutionLog } from '../components/ExecutionLog'
import { ScreenWakeTest } from '../components/ScreenWakeTest'
import { PrepareModule } from '../components/PrepareModule'
import type { AdbDevice } from '../../electron/main/adb/types'
import { useSettings } from '../store/settings'
import { useAuditLog } from '../store/auditLog'

export function Home() {
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

  // Diagnostic automatique au démarrage — logs dans le journal
  useEffect(() => {
    let active = true
    window.electronAPI.adb.diagnose().then((d) => {
      if (!active) return
      const { addStep } = useAuditLog.getState()
      const ts = Date.now()
      addStep({
        label: `Chemin ADB utilisé : ${d.resolvedPath ?? '(introuvable)'}${d.simulationMode ? ' · MODE SIMULATION ACTIF' : ''}`,
        status: d.resolvedPath ? 'success' : 'failed_after_retries',
        attempts: 1,
        lastValue: d.resolvedPath,
        timestamp: ts,
      })
      if (d.adbDevices !== null) {
        const hasDevice = /\t(device|unauthorized|offline)/.test(d.adbDevices)
        addStep({
          label: `Résultat adb devices : ${d.adbDevices}`,
          status: hasDevice ? 'success' : 'failed_after_retries',
          attempts: 1,
          lastValue: d.adbDevices,
          timestamp: ts + 1,
        })
      }
      if (d.error) {
        addStep({
          label: `Erreur ADB : ${d.error}`,
          status: 'failed_after_retries',
          attempts: 1,
          lastValue: null,
          error: d.error,
          timestamp: ts + 2,
        })
      }
    }).catch(() => {})
    return () => { active = false }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleDiagnose() {
    window.electronAPI.adb.diagnose().then((d) => {
      const { addStep } = useAuditLog.getState()
      const ts = Date.now()
      addStep({ label: `[Diagnostic] Mode simulation : ${d.simulationMode ? 'OUI' : 'NON'}`, status: 'success', attempts: 1, lastValue: d.simulationMode, timestamp: ts })
      addStep({ label: `[Diagnostic] Chemin configuré : ${d.configuredPath || '(vide)'}`, status: 'success', attempts: 1, lastValue: d.configuredPath, timestamp: ts + 1 })
      addStep({ label: `[Diagnostic] Chemin résolu : ${d.resolvedPath ?? '(introuvable)'}`, status: d.resolvedPath ? 'success' : 'failed_after_retries', attempts: 1, lastValue: d.resolvedPath, timestamp: ts + 2 })
      if (d.adbVersion) addStep({ label: `[Diagnostic] adb version : ${d.adbVersion}`, status: 'success', attempts: 1, lastValue: d.adbVersion, timestamp: ts + 3 })
      if (d.adbDevices) addStep({ label: `[Diagnostic] adb devices : ${d.adbDevices}`, status: 'success', attempts: 1, lastValue: d.adbDevices, timestamp: ts + 4 })
      addStep({ label: `[Diagnostic] PATH Electron : ${d.pathEnv}`, status: 'success', attempts: 1, lastValue: d.pathEnv, timestamp: ts + 5 })
      if (d.error) addStep({ label: `[Diagnostic] Erreur : ${d.error}`, status: 'failed_after_retries', attempts: 1, lastValue: null, error: d.error, timestamp: ts + 6 })
    }).catch((e: unknown) => {
      const { addStep } = useAuditLog.getState()
      addStep({ label: `[Diagnostic] Appel échoué : ${e instanceof Error ? e.message : String(e)}`, status: 'failed_after_retries', attempts: 1, lastValue: null, timestamp: Date.now() })
    })
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Préparation console</h2>
          <p className="page-desc">
            Configure automatiquement la console sans aucune interaction manuelle.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button type="button" className="btn-ghost btn-sm" onClick={handleDiagnose} title="Lance adb version + adb devices et affiche le résultat dans le journal ci-dessous">
            Diagnostiquer ADB
          </button>
          <DeviceStatus />
        </div>
      </div>

      <div className="page-content page-content--fill">
        <PrepareModule device={device} />
        <ScreenWakeTest device={device} />
        <ExecutionLog />
      </div>
    </div>
  )
}
