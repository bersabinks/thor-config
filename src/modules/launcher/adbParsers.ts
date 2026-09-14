/** Nom de package Android : au moins deux segments séparés par des points. */
const PKG = '[A-Za-z][\\w]*(?:\\.[A-Za-z_][\\w]*)+'
const COMPONENT_RE = new RegExp(`^(${PKG})\\/([\\w.$]+)$`)
const PKG_LINE_RE = new RegExp(`^${PKG}$`)
const RESUMED_RE = new RegExp(
  `(?:topResumedActivity|mResumedActivity)[:=]\\s*ActivityRecord\\{[^}\\s]+\\s+u\\d+\\s+(${PKG})\\/`
)

export interface ResolvedComponent {
  packageName: string
  activity: string
  /** Forme "package/activité" attendue par set-home-activity. */
  component: string
}

function lines(output: string): string[] {
  return output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
}

/** `pm list packages <filtre>` filtre par sous-chaîne : on exige la ligne exacte. */
export function isPackageListed(pmOutput: string, packageName: string): boolean {
  return lines(pmOutput).includes(`package:${packageName}`)
}

/**
 * Composant renvoyé par `cmd package resolve-activity --brief` (dernière ligne
 * "package/activité"). null si aucune activité, ou si Android renvoie son
 * sélecteur (`android/com.android.internal.app.ResolverActivity`) faute de défaut.
 */
export function parseResolvedComponent(output: string): ResolvedComponent | null {
  for (const line of lines(output).reverse()) {
    const m = COMPONENT_RE.exec(line)
    if (m) return { packageName: m[1], activity: m[2], component: line }
  }
  return null
}

/** Packages listés par `cmd role get-role-holders <rôle>` (un par ligne). */
export function parseRoleHolders(output: string): string[] {
  return lines(output).filter((l) => PKG_LINE_RE.test(l))
}

/** Package de l'activité au premier plan, d'après `dumpsys activity activities`. */
export function parseResumedPackage(output: string): string | null {
  return RESUMED_RE.exec(output)?.[1] ?? null
}

export function parseCount(output: string): number | null {
  const n = Number.parseInt(output.trim(), 10)
  return Number.isFinite(n) && n >= 0 ? n : null
}
