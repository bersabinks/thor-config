import { describe, it, expect } from 'vitest'
import { run, makeSimulationLauncherIpc, LAUNCHER_CONFIG, LAUNCHER_COMMANDS } from '../index'
import type { StepResult } from '../../../verification'

const PKG = 'rip.moth.cocoonshell'
const FAST = { maxRetries: 0, retryDelayMs: 0 }

function byLabel(steps: StepResult[], suffix: string): StepResult {
  const step = steps.find((s) => s.label.endsWith(suffix))
  if (!step) throw new Error(`étape « ${suffix} » absente`)
  return step
}

describe('launcherConfig.json — valeurs confirmées par ADB', () => {
  it('Cocoon utilise le packageName rip.moth.cocoonshell', () => {
    expect(LAUNCHER_CONFIG.packageName).toBe(PKG)
  })

  it('l’activité principale relevée sur la console est rip.moth.cocoonshell/.MainActivity', () => {
    expect(LAUNCHER_CONFIG.mainActivity).toBe(`${PKG}/.MainActivity`)
  })

  it('avec la config embarquée, le Home est défini sans résolution d’activité', async () => {
    const ipc = makeSimulationLauncherIpc()
    const res = await run({ serial: 'sim', onStep: () => {}, ipc, options: FAST })

    expect(byLabel(res.steps, 'Définition comme Home').status).toBe('success')
    expect(ipc.commands).toContain(LAUNCHER_COMMANDS.setHomeActivity(`${PKG}/.MainActivity`))
    expect(ipc.commands).not.toContain(LAUNCHER_COMMANDS.resolveHome(PKG))
  })
})

describe('run — console nominale', () => {
  it('détecte Cocoon, le définit comme Home vérifié et confirme qu’il est au premier plan', async () => {
    const ipc = makeSimulationLauncherIpc()
    const seen: StepResult[] = []
    const res = await run({ serial: 'sim', onStep: (s) => seen.push(s), ipc, options: FAST })

    expect(res.steps.map((s) => [s.label, s.status])).toEqual([
      ['Cocoon — Présence du launcher', 'success'],
      ['Cocoon — Bibliothèque (rescan + scraping)', 'skipped'],
      ['Cocoon — Définition comme Home', 'success'],
      ['Cocoon — Launcher actif', 'success'],
      ['Cocoon — Raccourcis jeux PC (Steam)', 'skipped'],
    ])
    expect(seen).toEqual(res.steps)
    // Étapes non automatisables → jamais un succès complet.
    expect(res.overallStatus).toBe('partial')

    expect(byLabel(res.steps, 'Définition comme Home').note).toBe(`Composant : ${PKG}/.MainActivity`)
    expect(ipc.commands).toContain(LAUNCHER_COMMANDS.setHomeActivity(`${PKG}/.MainActivity`))
    expect(ipc.commands).not.toContain(LAUNCHER_COMMANDS.addHomeRoleHolder(PKG))
  })

  it('l’étape bibliothèque indique le nombre de fichiers ROMs et pourquoi elle est ignorée', async () => {
    const ipc = makeSimulationLauncherIpc({ romFiles: 7 })
    const res = await run({
      serial: 'sim',
      onStep: () => {},
      ipc,
      options: { ...FAST, romsRemoteBase: '/sdcard/Jeux' },
    })

    const library = byLabel(res.steps, 'Bibliothèque (rescan + scraping)')
    expect(library.lastValue).toBe(7)
    expect(library.note).toMatch(/^7 fichier\(s\) présent\(s\) dans \/sdcard\/Jeux\./)
    expect(library.note).toMatch(/Android\/data/)
    expect(ipc.commands).toContain(LAUNCHER_COMMANDS.countFiles('/sdcard/Jeux'))
  })
})

describe('run — launcher absent', () => {
  it('échoue explicitement sans tenter de définir le Home', async () => {
    const ipc = makeSimulationLauncherIpc({ installed: false })
    const res = await run({ serial: 'sim', onStep: () => {}, ipc, options: FAST })

    const presence = byLabel(res.steps, 'Présence du launcher')
    expect(presence.status).toBe('failed_after_retries')
    expect(presence.error).toMatch(/absent de la console.*aucune source APK/)
    expect(byLabel(res.steps, 'Définition comme Home').error).toMatch(/launcher absent/)
    expect(byLabel(res.steps, 'Launcher actif').status).toBe('failed_after_retries')
    expect(ipc.commands.some((c) => c.includes('set-home-activity') || c.includes('add-role-holder'))).toBe(false)
    expect(res.overallStatus).toBe('failed')
  })
})

describe('run — définition du Home', () => {
  it('bascule sur le rôle HOME quand set-home-activity est refusé', async () => {
    const ipc = makeSimulationLauncherIpc({ setHomeActivitySupported: false })
    const res = await run({ serial: 'sim', onStep: () => {}, ipc, options: FAST })

    expect(byLabel(res.steps, 'Définition comme Home').status).toBe('success')
    expect(ipc.commands).toContain(LAUNCHER_COMMANDS.addHomeRoleHolder(PKG))
    expect(byLabel(res.steps, 'Launcher actif').status).toBe('success')
  })

  it('sans service role (Android < 10), vérifie via la résolution de l’intent HOME', async () => {
    const ipc = makeSimulationLauncherIpc({ roleServiceAvailable: false })
    const res = await run({ serial: 'sim', onStep: () => {}, ipc, options: FAST })

    expect(byLabel(res.steps, 'Définition comme Home').status).toBe('success')
    expect(ipc.commands).toContain(LAUNCHER_COMMANDS.resolveHome())
  })

  it('si aucune méthode ne fonctionne, le Home est en échec vérifié et le launcher actif aussi', async () => {
    const ipc = makeSimulationLauncherIpc({ setHomeActivitySupported: false, roleServiceAvailable: false })
    const res = await run({ serial: 'sim', onStep: () => {}, ipc, options: FAST })

    const home = byLabel(res.steps, 'Définition comme Home')
    expect(home.status).toBe('failed_after_retries')
    expect(home.attempts).toBe(1)
    expect(byLabel(res.steps, 'Launcher actif').error).toMatch(/non défini comme Home/)
    expect(res.overallStatus).toBe('partial')
  })

  it('mainActivity null : résout l’activité HOME sur la console', async () => {
    const ipc = makeSimulationLauncherIpc()
    const res = await run({
      serial: 'sim',
      onStep: () => {},
      ipc,
      options: { ...FAST, config: { ...LAUNCHER_CONFIG, mainActivity: null } },
    })

    expect(byLabel(res.steps, 'Définition comme Home').status).toBe('success')
    expect(ipc.commands).toContain(LAUNCHER_COMMANDS.resolveHome(PKG))
  })

  it('mainActivity null et aucune activité HOME déclarée : échoue avec l’indication de renseigner mainActivity', async () => {
    const ipc = makeSimulationLauncherIpc({ homeActivity: null })
    const res = await run({
      serial: 'sim',
      onStep: () => {},
      ipc,
      options: { ...FAST, config: { ...LAUNCHER_CONFIG, mainActivity: null } },
    })

    const home = byLabel(res.steps, 'Définition comme Home')
    expect(home.status).toBe('failed_after_retries')
    expect(home.error).toMatch(/mainActivity/)
    expect(ipc.commands.some((c) => c.includes('set-home-activity'))).toBe(false)
  })

  it.each([
    ['.MainActivity', `${PKG}/.MainActivity`],
    [`${PKG}/.MainActivity`, `${PKG}/.MainActivity`],
  ])('mainActivity "%s" renseigné → utilisé sans résolution', async (mainActivity, component) => {
    const ipc = makeSimulationLauncherIpc()
    const res = await run({
      serial: 'sim',
      onStep: () => {},
      ipc,
      options: { ...FAST, config: { ...LAUNCHER_CONFIG, mainActivity } },
    })

    expect(byLabel(res.steps, 'Définition comme Home').status).toBe('success')
    expect(ipc.commands).toContain(LAUNCHER_COMMANDS.setHomeActivity(component))
    expect(ipc.commands).not.toContain(LAUNCHER_COMMANDS.resolveHome(PKG))
  })
})

describe('run — launcher actif', () => {
  it('échoue si une autre application reste au premier plan après HOME', async () => {
    const ipc = makeSimulationLauncherIpc({ homeKeyWorks: false })
    const res = await run({ serial: 'sim', onStep: () => {}, ipc, options: FAST })

    expect(byLabel(res.steps, 'Définition comme Home').status).toBe('success')
    const active = byLabel(res.steps, 'Launcher actif')
    expect(active.status).toBe('failed_after_retries')
    expect(active.lastValue).toBe('com.android.launcher3')
  })

  it('la lecture du premier plan neutralise le code de sortie de grep', () => {
    expect(LAUNCHER_COMMANDS.resumedActivity).toMatch(/\|\| true$/)
  })
})
