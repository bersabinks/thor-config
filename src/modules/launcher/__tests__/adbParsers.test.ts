import { describe, it, expect } from 'vitest'
import {
  isPackageListed,
  parseCount,
  parseResolvedComponent,
  parseResumedPackage,
  parseRoleHolders,
} from '../adbParsers'

const PKG = 'rip.moth.cocoonshell'

describe('isPackageListed', () => {
  it('exige la ligne exacte (pm list filtre par sous-chaîne)', () => {
    expect(isPackageListed(`package:${PKG}\r\npackage:com.ayn.settings`, PKG)).toBe(true)
    expect(isPackageListed(`package:${PKG}.beta`, PKG)).toBe(false)
    expect(isPackageListed('', PKG)).toBe(false)
  })
})

describe('parseResolvedComponent', () => {
  it('lit le composant après la ligne de priorité de --brief', () => {
    const out = `priority=0 preferredOrder=0 match=0x108000 specificIndex=-1 isDefault=false\n${PKG}/.MainActivity`
    expect(parseResolvedComponent(out)).toEqual({
      packageName: PKG,
      activity: '.MainActivity',
      component: `${PKG}/.MainActivity`,
    })
  })

  it('accepte un nom de classe complet', () => {
    expect(parseResolvedComponent(`${PKG}/rip.moth.cocoonshell.ui.HomeActivity$Alias`)?.activity).toBe(
      'rip.moth.cocoonshell.ui.HomeActivity$Alias'
    )
  })

  it('renvoie null sans activité ou pour le sélecteur Android (pas de Home par défaut)', () => {
    expect(parseResolvedComponent('No activity found')).toBeNull()
    expect(parseResolvedComponent('android/com.android.internal.app.ResolverActivity')).toBeNull()
  })
})

describe('parseRoleHolders', () => {
  it('liste les packages, ignore les lignes vides ou parasites', () => {
    expect(parseRoleHolders(`${PKG}\n\n`)).toEqual([PKG])
    expect(parseRoleHolders('')).toEqual([])
    expect(parseRoleHolders("cmd: Can't find service: role")).toEqual([])
  })
})

describe('parseResumedPackage', () => {
  it('lit topResumedActivity (Android 10+) et mResumedActivity', () => {
    expect(
      parseResumedPackage(`  topResumedActivity=ActivityRecord{e3a1c2 u0 ${PKG}/.MainActivity t42}`)
    ).toBe(PKG)
    expect(
      parseResumedPackage('    mResumedActivity: ActivityRecord{9f0 u0 com.android.launcher3/.Launcher t1}')
    ).toBe('com.android.launcher3')
  })

  it('renvoie null sans activité au premier plan', () => {
    expect(parseResumedPackage('')).toBeNull()
  })
})

describe('parseCount', () => {
  it('lit la sortie de wc -l', () => {
    expect(parseCount('  42\n')).toBe(42)
    expect(parseCount('0')).toBe(0)
    expect(parseCount('wc: erreur')).toBeNull()
  })
})
