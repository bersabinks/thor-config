import { useEffect, useState } from 'react'
import { DeviceStatus } from '../components/DeviceStatus'
import { ExecutionLog } from '../components/ExecutionLog'
import { TesterChecklist } from '../components/TesterChecklist'
import type { AdbDevice } from '../../electron/main/adb/types'
import { useSettings } from '../store/settings'

export function Guide() {
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
          <h2>Guide & Accompagnement</h2>
          <p className="page-desc">
            Toutes les consignes de connexion, d'autorisation ADB et de test pour la AYN Thor Max.
          </p>
        </div>
        <DeviceStatus />
      </div>

      <div className="page-content">
        <div>
          <TesterChecklist device={device} defaultExpanded={true} />

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="card-header">
              <h3>Foire aux questions & Dépannage rapide</h3>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14, fontSize: 13 }}>
              <div>
                <strong>Q : La pastille en haut à droite reste grise « Aucun appareil connecté » ?</strong>
                <p className="hint" style={{ marginTop: 2 }}>
                  Vérifiez que votre câble USB gère bien le transfert de données (certains câbles ne font que la charge).
                  Changez de port USB sur votre PC (de préférence un port USB 3.0 directement sur la carte mère).
                </p>
              </div>

              <div>
                <strong>Q : La pastille indique « autorisez le débogage USB » ?</strong>
                <p className="hint" style={{ marginTop: 2 }}>
                  Déverrouillez la console Thor Max, débranchez et rebranchez le câble USB. La boîte de dialogue va réapparaître à l'écran.
                </p>
              </div>

              <div>
                <strong>Q : Et pour les jeux Nintendo Switch ?</strong>
                <p className="hint" style={{ marginTop: 2 }}>
                  Les émulateurs Switch exigent des clés de chiffrement propriétaires (<code>prod.keys</code>) qui ne peuvent pas être distribuées légalement.
                  Utilisez l'application <strong>Final ROM</strong> installée sur la console pour gérer vos fichiers et patchs directement.
                </p>
              </div>

              <div>
                <strong>Q : Puis-je tester sans console ?</strong>
                <p className="hint" style={{ marginTop: 2 }}>
                  Oui ! Activez le <strong>Mode simulation</strong> dans l'onglet Réglages. L'application simulera une console AYN Thor Max et vous permettra de voir tout le fonctionnement.
                </p>
              </div>
            </div>
          </div>
        </div>

        <ExecutionLog />
      </div>
    </div>
  )
}
