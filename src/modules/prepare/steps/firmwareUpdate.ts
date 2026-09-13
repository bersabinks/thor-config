import { runVerifiedAction, type StepResult } from '../../../verification'
import { useSettings } from '../../../store/settings'

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

/**
 * Déclenche la vérification de mise à jour firmware.
 * La "vérification" consiste à confirmer que l'appareil est réactif après le délai d'attente
 * (il peut avoir redémarré suite à une mise à jour). On logue la version avant/après.
 * Idempotente : si la version est déjà à jour et l'appareil réactif, succès immédiat.
 */
export async function runFirmwareUpdate(serial: string): Promise<StepResult> {
  const { firmwareUpdateWaitSeconds } = useSettings.getState()

  // Lire la version initiale (pour l'afficher dans le rapport)
  const versionBefore = (
    await window.electronAPI.adb.shell(serial, 'getprop ro.build.version.incremental')
  ).trim()

  return runVerifiedAction<string>({
    label: `Mise à jour firmware (version avant : ${versionBefore})`,

    apply: async () => {
      await window.electronAPI.adb.shell(
        serial,
        'am start -a android.settings.SYSTEM_UPDATE_SETTINGS'
      )
      // Attendre le délai configurable (l'OTA peut être long)
      await sleep(firmwareUpdateWaitSeconds * 1000)
      // Attendre que l'appareil soit de nouveau disponible si il a redémarré
      await window.electronAPI.adb.waitForDevice(serial, 120_000)
    },

    check: async () => {
      const v = await window.electronAPI.adb.shell(
        serial,
        'getprop ro.build.version.incremental'
      )
      return v.trim()
    },

    // Succès = l'appareil répond et renvoie une version non-vide
    expected: (v) => v.length > 0,
    expectedDescription: 'version firmware non vide (appareil réactif après mise à jour)',
    maxRetries: 1,
    retryDelayMs: 5000,
  })
}
