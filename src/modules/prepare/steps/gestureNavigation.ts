import { runVerifiedAction, type StepResult } from '../../../verification'
import { dumpUiHierarchy, findByText, navigateByTextPath } from '../uiAutomation'

const GESTURE_NAV_VALUE = '2'
const SETTING_KEY = 'navigation_mode'
const SETTING_NS = 'secure'

/**
 * Active la navigation par gestes sur Android.
 * Essaie d'abord la commande ADB directe (settings put),
 * puis fallback sur l'UI Automator si la valeur n'est pas acceptée.
 * Idempotente : si déjà à '2', ne fait rien.
 */
export async function runGestureNavigation(serial: string): Promise<StepResult> {
  return runVerifiedAction<string>({
    label: 'Navigation par gestes',
    apply: async () => {
      // Tenter la commande directe
      await window.electronAPI.adb.shell(
        serial,
        `settings put ${SETTING_NS} ${SETTING_KEY} ${GESTURE_NAV_VALUE}`
      )

      // Vérifier si elle a été prise en compte
      const value = await window.electronAPI.adb.shell(
        serial,
        `settings get ${SETTING_NS} ${SETTING_KEY}`
      )

      if (value.trim() === GESTURE_NAV_VALUE) return // déjà bon

      // Fallback : navigation UI Automator
      await window.electronAPI.adb.shell(
        serial,
        'am start -a android.settings.SETTINGS'
      )
      await navigateByTextPath(serial, [
        'System',
        'Gestures',
        'System navigation',
        'Gesture navigation',
      ])
    },

    check: async () => {
      // Priorité : relire la valeur du setting
      const val = await window.electronAPI.adb.shell(
        serial,
        `settings get ${SETTING_NS} ${SETTING_KEY}`
      )
      if (val.trim() === GESTURE_NAV_VALUE) return val.trim()

      // Fallback check : chercher la radio sélectionnée dans l'UI
      const nodes = await dumpUiHierarchy(serial)
      const node = findByText(nodes, 'Gesture navigation', { exact: true })
      return node?.selected || node?.checked ? GESTURE_NAV_VALUE : val.trim()
    },

    expected: (v) => v === GESTURE_NAV_VALUE,
    expectedDescription: `"${GESTURE_NAV_VALUE}" (mode gesture navigation)`,
    maxRetries: 2,
    retryDelayMs: 1500,
  })
}
