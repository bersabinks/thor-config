import { describe, expect, it, vi } from 'vitest'
import {
  buildObtainiumAppsJson,
  obtainiumImportCommand,
  OBTAINIUM_APPS_JSON_REMOTE_PATH,
  OBTAINIUM_SOURCE,
  setupObtainium,
  type ObtainiumIpc,
} from '../obtainium'
import sourcesJson from '../sources.json'
import type { EmulatorSource } from '../emulatorInstall'

const sources = sourcesJson as EmulatorSource[]
const FAST = { retryDelayMs: 0, maxRetries: 1 }

function fakeIpc(overrides: Partial<ObtainiumIpc> = {}) {
  const device = new Map<string, string>()
  const ipc = {
    prepareApk: vi.fn(async ({ id }: { id: string }) => ({ localPath: `/cache/${id}.apk`, version: '1.6.17' })),
    installApk: vi.fn(async () => {}),
    getPackageInfo: vi.fn(async () => ({ versionName: '1.6.17' })),
    applyConfig: vi.fn(async () => {}),
    verifyConfig: vi.fn(async () => ({})),
    ensureRemoteDir: vi.fn(async () => {}),
    writeRemoteText: vi.fn(async (_s: string, p: string, c: string) => void device.set(p, c)),
    readRemoteText: vi.fn(async (_s: string, p: string) => device.get(p) ?? ''),
    shell: vi.fn(async () => 'Starting: Intent { act=android.intent.action.VIEW }'),
    ...overrides,
  }
  return { ipc, device }
}

describe('apps.json pour Obtainium', () => {
  const { apps } = buildObtainiumAppsJson(sources)
  const trackable = sources.filter((s) => s.sourceType !== 'playstore')

  it('liste les émulateurs suivables de sources.json, identifiés par leur packageName', () => {
    expect(apps.map((a) => a.id)).toEqual(trackable.map((s) => s.packageName))
    expect(apps.some((a) => a.id === OBTAINIUM_SOURCE.packageName)).toBe(false)
  })

  it('écarte les apps distribuées uniquement par Google Play (aucune source Obtainium)', () => {
    const playstore = sources.filter((s) => s.sourceType === 'playstore')
    expect(playstore.length).toBeGreaterThan(0)
    for (const s of playstore) expect(apps.some((a) => a.id === s.packageName), s.id).toBe(false)
  })

  it('F-Droid officiel (PPSSPP) : page de l’app, source déduite de l’URL', () => {
    const ppsspp = apps.find((a) => a.id === 'org.ppsspp.ppsspp')!
    expect(ppsspp.url).toBe('https://f-droid.org/packages/org.ppsspp.ppsspp')
    expect(ppsspp.overrideSource).toBeNull()
    expect(JSON.parse(ppsspp.additionalSettings)).toEqual({})
  })

  it('champs requis par App.fromJson présents, additionalSettings en chaîne JSON', () => {
    for (const app of apps) {
      for (const field of ['id', 'url', 'author', 'name'] as const) expect(typeof app[field], `${app.id}.${field}`).toBe('string')
      expect(() => JSON.parse(app.additionalSettings)).not.toThrow()
    }
  })

  it('émulateurs GitHub : URL du dépôt, releases stables, même filtre d’APK', () => {
    const wm = apps.find((a) => a.id === 'me.magnum.melondualds')!
    expect(wm.url).toBe('https://github.com/SapphireRhodonite/WatermelonDS')
    expect(wm.author).toBe('SapphireRhodonite')
    expect(wm.overrideSource).toBeNull()
    expect(JSON.parse(wm.additionalSettings)).toEqual({
      includePrereleases: false,
      apkFilterRegEx: sources.find((s) => s.id === 'watermelonds')!.assetPattern,
    })
  })

  it('Dolphin : dépôt F-Droid tiers (source FDroidRepo + appIdOrName)', () => {
    const dolphin = apps.find((a) => a.id === 'org.dolphinemu.dolphinemu')!
    expect(dolphin.url).toBe('https://fdroid.dolphin-emu.org/fdroid/repo')
    expect(dolphin.overrideSource).toBe('FDroidRepo')
    expect(JSON.parse(dolphin.additionalSettings)).toEqual({ appIdOrName: 'org.dolphinemu.dolphinemu' })
  })

  it('lien obtainium://apps/ : décodé comme par Obtainium, sans apostrophe qui casserait le shell', () => {
    const cmd = obtainiumImportCommand(apps)
    expect(cmd).toMatch(/^am start -a android\.intent\.action\.VIEW -p dev\.imranr\.obtainium -d 'obtainium:\/\/apps\/[^']+'$/)
    const uri = new URL(/'(.+)'/.exec(cmd)![1])
    expect(uri.host).toBe('apps')
    expect(JSON.parse(decodeURIComponent(uri.pathname.substring(1)))).toEqual(apps)
  })
})

describe('setupObtainium', () => {
  it('installe Obtainium, dépose apps.json vérifié et ouvre le dialogue d’import', async () => {
    const { ipc, device } = fakeIpc()
    const steps = await setupObtainium('s', sources, ipc, FAST)

    expect(steps.map((s) => [s.label, s.status])).toEqual([
      ['Obtainium — Téléchargement APK', 'success'],
      ['Obtainium — Installation', 'success'],
      ['Obtainium — Liste des émulateurs (apps.json)', 'success'],
      ['Obtainium — Import des émulateurs', 'skipped'],
    ])
    expect(ipc.getPackageInfo).toHaveBeenCalledWith('s', 'dev.imranr.obtainium')
    expect(ipc.applyConfig).not.toHaveBeenCalled()
    expect(JSON.parse(device.get(OBTAINIUM_APPS_JSON_REMOTE_PATH)!).apps).toHaveLength(
      sources.filter((s) => s.sourceType !== 'playstore').length
    )
    expect(steps[2].note).toMatch(/Hors suivi \(Google Play/)
    expect(ipc.ensureRemoteDir).toHaveBeenCalledWith('s', '/sdcard/Download')
    expect(steps[3].note).toMatch(/confirmer sur la console/)
  })

  it('Obtainium non installé : rien n’est déposé', async () => {
    const { ipc } = fakeIpc({ getPackageInfo: vi.fn(async () => null) })
    const steps = await setupObtainium('s', sources, ipc, FAST)
    expect(steps.slice(2).every((s) => s.status === 'failed_after_retries')).toBe(true)
    expect(ipc.writeRemoteText).not.toHaveBeenCalled()
    expect(ipc.shell).not.toHaveBeenCalled()
  })

  it('fichier relu différent : échec de la liste', async () => {
    const { ipc } = fakeIpc({ readRemoteText: vi.fn(async () => '{"apps":[]}') })
    const list = (await setupObtainium('s', sources, ipc, FAST)).find((s) => s.label.includes('apps.json'))!
    expect(list.status).toBe('failed_after_retries')
  })

  it('lien non résolu par Android : consigne d’import manuel', async () => {
    const { ipc } = fakeIpc({ shell: vi.fn(async () => 'Error: Activity not started, unable to resolve Intent') })
    const imp = (await setupObtainium('s', sources, ipc, FAST)).at(-1)!
    expect(imp.status).toBe('skipped')
    expect(imp.note).toMatch(/Import\/Export → Obtainium Import → \/sdcard\/Download\/thorconfig-obtainium-apps\.json/)
  })
})
