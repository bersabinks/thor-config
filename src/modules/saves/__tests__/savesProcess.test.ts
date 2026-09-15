import { describe, it, expect } from 'vitest'
import { createHash } from 'crypto'
import { backup, restore, migrate, type SavesIpc } from '../savesProcess'

const FAST = { maxRetries: 1, retryDelayMs: 0 }
const ROOT = '/sdcard/melonds/saves'

function sha(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function makeMemIpc() {
  const device = new Map<string, string>()
  const local = new Map<string, string>()
  const pushLog: { local: string; device: string }[] = []

  const ipc: SavesIpc = {
    async listDeviceFiles(_s, dir) {
      const prefix = dir.endsWith('/') ? dir : dir + '/'
      return [...device.keys()].filter((k) => k.startsWith(prefix))
    },
    async sha256Device(_s, p) {
      if (!device.has(p)) throw new Error('device: fichier absent ' + p)
      return sha(device.get(p)!)
    },
    async deviceFileSize(_s, p) {
      return (device.get(p) ?? '').length
    },
    async pullFile(_s, dp, lp) {
      if (!device.has(dp)) throw new Error('device: fichier absent ' + dp)
      local.set(lp, device.get(dp)!)
    },
    async pushFile(_s, lp, dp) {
      if (!local.has(lp)) throw new Error('local: fichier absent ' + lp)
      pushLog.push({ local: lp, device: dp })
      device.set(dp, local.get(lp)!)
    },
    async ensureRemoteDir() {
      /* no-op */
    },
    async sha256Local(lp) {
      if (!local.has(lp)) throw new Error('local: fichier absent ' + lp)
      return sha(local.get(lp)!)
    },
    async writeText(lp, c) {
      local.set(lp, c)
    },
    async readText(lp) {
      if (!local.has(lp)) throw new Error('local: fichier absent ' + lp)
      return local.get(lp)!
    },
    localBackupPath(emu, id, ...rel) {
      return `/backups/${emu}/${id}/${rel.join('/')}`
    },
  }

  return { ipc, device, local, pushLog }
}

describe('backup', () => {
  it('sauvegarde et vérifie bit-à-bit chaque fichier', async () => {
    const { ipc, device, local } = makeMemIpc()
    device.set(`${ROOT}/a.sav`, 'AAA')
    device.set(`${ROOT}/b.sav`, 'BBB')

    const r = await backup('s1', 'watermelonds', 'initial', 'B1', ipc, FAST)

    expect(r.overallStatus).toBe('success')
    expect(r.manifest!.files).toHaveLength(2)
    expect(r.manifest!.files.every((f) => f.verified)).toBe(true)
    expect(r.manifest!.files.find((f) => f.relPath === 'saves/a.sav')!.sha256).toBe(sha('AAA'))
    expect(local.get('/backups/watermelonds/B1/saves/a.sav')).toBe('AAA')
    expect(local.has('/backups/watermelonds/B1/manifest.json')).toBe(true)
  })

  it('exclut du manifest un fichier dont le hash device est illisible', async () => {
    const { ipc, device } = makeMemIpc()
    device.set(`${ROOT}/a.sav`, 'AAA')
    const broken: SavesIpc = { ...ipc, sha256Device: async () => { throw new Error('io') } }

    const r = await backup('s', 'watermelonds', 'manual', 'B', broken, FAST)

    expect(r.overallStatus).toBe('failed')
    expect(r.manifest!.files).toHaveLength(0)
    expect(r.steps[0].status).toBe('failed_after_retries')
  })

  it('marque verified:false si la copie locale ne correspond pas (pull corrompu)', async () => {
    const { ipc, device, local } = makeMemIpc()
    device.set(`${ROOT}/a.sav`, 'AAA')
    const corrupt: SavesIpc = { ...ipc, pullFile: async (_s, _dp, lp) => { local.set(lp, 'WRONG') } }

    const r = await backup('s', 'watermelonds', 'manual', 'B', corrupt, FAST)

    expect(r.steps[0].status).toBe('failed_after_retries')
    expect(r.manifest!.files[0].verified).toBe(false)
    expect(r.overallStatus).toBe('failed')
  })
})

describe('restore — garde-fous', () => {
  it('nominal : intégrité OK, snapshot de sécurité, push vérifié', async () => {
    const { ipc, device, local } = makeMemIpc()
    device.set(`${ROOT}/a.sav`, 'AAA')
    await backup('s', 'watermelonds', 'initial', 'B1', ipc, FAST)
    device.set(`${ROOT}/a.sav`, 'CHANGED') // état courant à écraser

    const r = await restore('s', 'watermelonds', 'B1', ipc, { ...FAST, safetyBackupId: 'SAFE' })

    expect(r.overallStatus).toBe('success')
    expect(r.safetyBackupId).toBe('SAFE')
    // Données restaurées à l'original.
    expect(device.get(`${ROOT}/a.sav`)).toBe('AAA')
    // Le snapshot de sécurité a bien capté l'état AVANT écrasement.
    expect(local.get('/backups/watermelonds/SAFE/saves/a.sav')).toBe('CHANGED')
  })

  it('manifest absent → échec, aucun push (appareil intact)', async () => {
    const { ipc, pushLog } = makeMemIpc()
    const r = await restore('s', 'watermelonds', 'NOPE', ipc, FAST)
    expect(r.overallStatus).toBe('failed')
    expect(r.safetyBackupId).toBeNull()
    expect(pushLog).toHaveLength(0)
  })

  it('manifest corrompu → échec, aucun push', async () => {
    const { ipc, local, pushLog } = makeMemIpc()
    local.set('/backups/watermelonds/BAD/manifest.json', '{pas du json')
    const r = await restore('s', 'watermelonds', 'BAD', ipc, FAST)
    expect(r.overallStatus).toBe('failed')
    expect(pushLog).toHaveLength(0)
  })

  it('backup local corrompu (hash ≠ manifest) → ABANDON avant tout push', async () => {
    const { ipc, device, local, pushLog } = makeMemIpc()
    device.set(`${ROOT}/a.sav`, 'AAA')
    await backup('s', 'watermelonds', 'initial', 'B1', ipc, FAST)
    // On altère le fichier de backup local : il ne correspond plus à son hash.
    local.set('/backups/watermelonds/B1/saves/a.sav', 'TAMPERED')

    const r = await restore('s', 'watermelonds', 'B1', ipc, { ...FAST, safetyBackupId: 'SAFE' })

    expect(r.overallStatus).toBe('failed')
    expect(r.safetyBackupId).toBeNull()
    expect(pushLog).toHaveLength(0) // rien poussé — saves de l'appareil intactes
    expect(
      r.steps.some((s) => s.label.includes('Intégrité') && s.status === 'failed_after_retries')
    ).toBe(true)
  })

  it('vérification post-push échoue (push corrompu) → étape en échec, snapshot conservé', async () => {
    const { ipc, device } = makeMemIpc()
    device.set(`${ROOT}/a.sav`, 'AAA')
    await backup('s', 'watermelonds', 'initial', 'B1', ipc, FAST)
    const corruptPush: SavesIpc = {
      ...ipc,
      pushFile: async (_s, _lp, dp) => { device.set(dp, 'CORRUPT') },
    }

    const r = await restore('s', 'watermelonds', 'B1', corruptPush, { ...FAST, safetyBackupId: 'SAFE' })

    const pushStep = r.steps.find((s) => s.label.includes('Restauration vérifiée'))!
    expect(pushStep.status).toBe('failed_after_retries')
    expect(['failed', 'partial']).toContain(r.overallStatus)
    expect(r.safetyBackupId).toBe('SAFE') // snapshot pris → récupération possible
  })

  it('snapshot de sécurité impossible → ABANDON avant tout push', async () => {
    const { ipc, device, local, pushLog } = makeMemIpc()
    device.set(`${ROOT}/a.sav`, 'AAA')
    await backup('s', 'watermelonds', 'initial', 'B1', ipc, FAST)
    // sha256Device casse → le snapshot de sécurité ne peut pas se vérifier.
    const flaky: SavesIpc = { ...ipc, sha256Device: async () => { throw new Error('device gone') } }

    const r = await restore('s', 'watermelonds', 'B1', flaky, { ...FAST, safetyBackupId: 'SAFE' })

    expect(r.overallStatus).toBe('failed')
    expect(r.safetyBackupId).toBeNull()
    expect(pushLog).toHaveLength(0)
    expect(
      r.steps.some((s) => s.label.includes('Snapshot de sécurité') && s.status === 'failed_after_retries')
    ).toBe(true)
    // local reste cohérent
    void local
  })
})

describe('migrate', () => {
  it('backup source vérifié puis restore cible → succès', async () => {
    const { ipc, device } = makeMemIpc()
    device.set(`${ROOT}/a.sav`, 'AAA')
    const r = await migrate('src', 'tgt', 'watermelonds', 'MIG', ipc, { ...FAST, safetyBackupId: 'SAFE' })
    expect(r.overallStatus).toBe('success')
    expect(device.get(`${ROOT}/a.sav`)).toBe('AAA')
  })

  it('source vide → statut empty, pas de restauration', async () => {
    const { ipc, pushLog } = makeMemIpc()
    const r = await migrate('src', 'tgt', 'watermelonds', 'MIG', ipc, FAST)
    expect(r.overallStatus).toBe('empty')
    expect(pushLog).toHaveLength(0)
  })
})
