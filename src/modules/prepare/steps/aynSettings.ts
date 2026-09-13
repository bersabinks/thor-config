import { runVerifiedAction, type StepResult } from '../../../verification'
import {
  dumpUiHierarchy,
  findByText,
  navigateByTextPath,
  tapNode,
} from '../uiAutomation'
import { useSettings } from '../../../store/settings'
import labels from '../aynMenuLabels.json'

type AbxyLayout = 'Xbox' | 'Nintendo'
type TriggerMode = 'Analog' | 'Digital'

async function findAynPackage(serial: string): Promise<string | null> {
  const output = await window.electronAPI.adb.shell(serial, 'pm list packages | grep ayn')
  for (const hint of labels.packageHints) {
    if (output.includes(hint)) return hint
  }
  // Extraire le premier package trouvé dans la liste
  const match = /package:(\S+)/.exec(output)
  return match?.[1] ?? null
}

async function launchAynSettings(serial: string): Promise<void> {
  const pkg = await findAynPackage(serial)
  if (!pkg) throw new Error('App AYN Settings introuvable sur la console')
  await window.electronAPI.adb.shell(
    serial,
    `monkey -p ${pkg} -c android.intent.category.LAUNCHER 1`
  )
}

async function setOption(
  serial: string,
  menuPath: string[],
  targetLabel: string
): Promise<void> {
  // Ouvrir l'app + naviguer jusqu'à l'écran voulu
  await launchAynSettings(serial)
  await navigateByTextPath(serial, menuPath)

  // Vérifier si l'option est déjà sélectionnée (idempotence)
  const nodes = await dumpUiHierarchy(serial)
  const current = findByText(nodes, targetLabel, { exact: true })
  if (current?.selected || current?.checked) return // déjà correct

  // Taper sur l'option cible
  const target = findByText(nodes, targetLabel)
  if (!target) throw new Error(`Option introuvable dans l'UI : "${targetLabel}"`)
  await tapNode(serial, target)
}

async function checkOption(serial: string, label: string): Promise<boolean> {
  const nodes = await dumpUiHierarchy(serial)
  const node = findByText(nodes, label, { exact: true })
  return node !== null && (node.selected || node.checked)
}

/**
 * Configure le layout ABXY et le mode des gâchettes dans l'app AYN Settings.
 * Lit les préférences de l'utilisateur depuis le store Zustand.
 * Labels externalisés dans aynMenuLabels.json pour faciliter l'ajustement.
 */
export async function runAynSettings(serial: string): Promise<StepResult[]> {
  const { aynAbxyLayout, aynTriggerMode } = useSettings.getState()

  const abxyLabel = labels.abxyLabels[aynAbxyLayout as AbxyLayout]
  const triggerLabel = labels.triggerLabels[aynTriggerMode as TriggerMode]

  const abxyResult = await runVerifiedAction<boolean>({
    label: `AYN Settings — Layout ABXY : ${aynAbxyLayout}`,
    apply: async () => {
      await setOption(serial, labels.abxyPath, abxyLabel)
    },
    check: async () => checkOption(serial, abxyLabel),
    expected: (ok) => ok,
    expectedDescription: `bouton "${abxyLabel}" sélectionné dans l'UI AYN Settings`,
    maxRetries: 2,
    retryDelayMs: 1500,
  })

  const triggerResult = await runVerifiedAction<boolean>({
    label: `AYN Settings — Mode gâchettes : ${aynTriggerMode}`,
    apply: async () => {
      await setOption(serial, labels.triggerPath, triggerLabel)
    },
    check: async () => checkOption(serial, triggerLabel),
    expected: (ok) => ok,
    expectedDescription: `option "${triggerLabel}" sélectionnée dans l'UI AYN Settings`,
    maxRetries: 2,
    retryDelayMs: 1500,
  })

  return [abxyResult, triggerResult]
}
