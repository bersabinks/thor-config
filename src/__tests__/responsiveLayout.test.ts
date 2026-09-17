import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Garde-fou responsive — l'application doit rester utilisable de 1280×720
 * (et du minimum fenêtre 800×500 déclaré dans electron/main/index.ts) jusqu'aux
 * grands écrans.
 *
 * ── Le bug que ce test verrouille ────────────────────────────────────────────
 * `.card` porte `overflow: hidden` (coins arrondis). En CSS flexbox, un élément
 * qui est un conteneur de défilement voit sa taille minimale automatique
 * (`min-height: auto`) résolue à **0**. Dans `.page-content`, qui est une
 * colonne flex, les cartes se faisaient donc écraser pour tenir dans la hauteur
 * de fenêtre : leur contenu était coupé, la page ne défilait pas, et les boutons
 * d'action (« Configurer ma console », « Installer », « Mettre à jour ») étaient
 * inatteignables sous 1080p. Invisible sur un 27 pouces, bloquant sur un laptop.
 *
 * Ce test vérifie statiquement le contrat CSS qui corrige cela. Il a été calibré
 * par une validation en vrai moteur de rendu (fenêtre Chromium via Electron,
 * 10 tailles × 11 pages × 2 états de contenu) : chaque bouton y était réellement
 * amené à l'écran par défilement utilisateur puis hit-testé.
 */

const here = dirname(fileURLToPath(import.meta.url))
const srcDir = join(here, '..')
// Commentaires retirés : ils contiennent des « : » et fausseraient le découpage
// des déclarations.
const css = readFileSync(join(srcDir, 'index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/**
 * Déclarations d'une règle CSS de premier niveau (`selector` exact, non indenté :
 * les surcharges à l'intérieur des media queries sont donc ignorées).
 */
function declarationsOf(selector: string): Record<string, string> {
  const out: Record<string, string> = {}
  const re = new RegExp(`^${escapeRe(selector)}\\s*\\{([^}]*)\\}`, 'gm')
  let m: RegExpExecArray | null
  while ((m = re.exec(css)) !== null) {
    for (const decl of m[1].split(';')) {
      const i = decl.indexOf(':')
      if (i === -1) continue
      out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim()
    }
  }
  return out
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** true si la règle empêche le rétrécissement (flex-shrink: 0, directement ou via le raccourci `flex`). */
function neverShrinks(decls: Record<string, string>): boolean {
  if (decls['flex-shrink'] === '0') return true
  const flex = decls['flex']
  if (!flex) return false
  const parts = flex.trim().split(/\s+/)
  return parts.length >= 2 && parts[1] === '0'
}

describe('responsive — contrat de mise en page (index.css)', () => {
  it('.page-content est le conteneur de défilement de la page', () => {
    const d = declarationsOf('.page-content')
    expect(d['overflow-y']).toBe('auto')
    expect(d['min-height']).toBe('0')
  })

  it('.page-content--fill défile aussi (ne jamais revenir à overflow: hidden)', () => {
    const d = declarationsOf('.page-content--fill')
    // Régression d'origine : `overflow: hidden` ici coupait tout le bas des
    // pages Configurer / Rapport final dès que la fenêtre était trop basse.
    expect(d['overflow']).toBeUndefined()
    expect(d['overflow-y']).toBe('auto')
  })

  it('les enfants directs de .page-content ne peuvent pas être écrasés', () => {
    // Sans cette règle, tout bloc en `overflow: hidden` (donc toute .card) est
    // rétréci par le moteur flex jusqu'à couper son contenu.
    expect(neverShrinks(declarationsOf('.page-content > *'))).toBe(true)
  })

  it('.card a overflow: hidden ET flex-shrink: 0 (les deux vont de pair)', () => {
    const d = declarationsOf('.card')
    expect(d['overflow']).toBe('hidden')
    expect(neverShrinks(d)).toBe(true)
  })

  it('.card--fill s’étire sans jamais rétrécir sous son contenu, et reste dans l’écran', () => {
    const d = declarationsOf('.card--fill')
    expect(neverShrinks(d)).toBe(true)
    // Plafond = zone visible : au-delà, c'est .card-body--scroll qui défile,
    // ce qui garde l'en-tête et le pied (bouton d'action) toujours affichés.
    expect(d['max-height']).toBe('100%')
  })

  it('en-tête et pied de carte ne sont jamais compressés (le bouton d’action reste entier)', () => {
    expect(declarationsOf('.card-header')['flex-shrink']).toBe('0')
    expect(declarationsOf('.card-footer')['flex-shrink']).toBe('0')
  })

  it('les listes longues défilent à l’intérieur de la carte', () => {
    const d = declarationsOf('.card-body--scroll')
    expect(d['overflow-y']).toBe('auto')
  })

  it('le journal d’exécution est plafonné et défile en interne', () => {
    const d = declarationsOf('.execution-log')
    expect(d['max-height']).toBeTruthy()
    expect(neverShrinks(d)).toBe(true)
    expect(declarationsOf('.log-body')['overflow-y']).toBe('auto')
  })

  it('la sidebar ne déborde pas : seule sa navigation défile', () => {
    const sidebar = declarationsOf('.sidebar')
    expect(sidebar['overflow']).toBe('hidden')
    const nav = declarationsOf('.sidebar-nav')
    expect(nav['overflow-y']).toBe('auto')
    expect(nav['min-height']).toBe('0')
    expect(declarationsOf('.sidebar-footer')['flex-shrink']).toBe('0')
  })

  it('la chaîne flex viewport → page garde min-height: 0 à chaque niveau', () => {
    expect(declarationsOf('.main-area')['min-height']).toBe('0')
    expect(declarationsOf('.page')['min-height']).toBe('0')
  })

  it('les en-têtes et bannières passent à la ligne sur fenêtre étroite', () => {
    expect(declarationsOf('.page-header')['flex-wrap']).toBe('wrap')
    expect(declarationsOf('.mode-banner')['flex-wrap']).toBe('wrap')
    expect(declarationsOf('.settings-row')['flex-wrap']).toBe('wrap')
  })

  it('des paliers responsive existent pour les fenêtres basses et étroites', () => {
    expect(css).toMatch(/@media \(max-height: 820px\)/)
    expect(css).toMatch(/@media \(max-height: 620px\)/)
    expect(css).toMatch(/@media \(max-width: 1150px\)/)
    expect(css).toMatch(/@media \(max-width: 920px\)/)
  })
})

describe('responsive — structure des pages (src/pages)', () => {
  const pageFiles = readdirSync(join(srcDir, 'pages')).filter((f) => f.endsWith('.tsx'))

  it('toutes les pages sont présentes', () => {
    expect(pageFiles.length).toBeGreaterThanOrEqual(11)
  })

  for (const file of pageFiles) {
    const source = readFileSync(join(srcDir, 'pages', file), 'utf8')

    describe(file, () => {
      it('utilise le squelette .page / .page-header / .page-content', () => {
        expect(source).toContain('className="page"')
        expect(source).toContain('className="page-header"')
        expect(source).toMatch(/className="page-content( page-content--fill)?"/)
      })

      it('n’introduit pas de conteneur qui coupe le contenu (overflow hidden en style inline)', () => {
        expect(source).not.toMatch(/overflow\s*:\s*['"]hidden['"]/)
        expect(source).not.toMatch(/overflowY\s*:\s*['"]hidden['"]/)
      })

      it('ne fige pas de hauteur en dur (px/vh) qui casserait sur un petit écran', () => {
        expect(source).not.toMatch(/\bheight\s*:\s*['"]?\d+(px|vh)/)
        expect(source).not.toMatch(/\bmaxHeight\s*:\s*['"]?\d+vh/)
      })

      // `page-content--fill` n'a de sens que si la page contient une carte qui
      // s'étire ; sinon la page défile simplement (cf. Configure / Rapport final).
      if (/className="page-content page-content--fill"/.test(source)) {
        it('déclare --fill uniquement si un module à carte extensible y est rendu', () => {
          const modules = [...source.matchAll(/<([A-Z]\w+)Module\b/g)].map((m) => `${m[1]}Module.tsx`)
          expect(modules.length).toBeGreaterThan(0)
          const hasFillCard = modules.some((mod) =>
            readFileSync(join(srcDir, 'components', mod), 'utf8').includes('card card--fill')
          )
          expect(hasFillCard, `${file} : page-content--fill sans carte .card--fill`).toBe(true)
        })
      }
    })
  }
})
