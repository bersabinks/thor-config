export interface UiNode {
  text: string
  resourceId: string
  className: string
  bounds: { left: number; top: number; right: number; bottom: number }
  checked: boolean
  selected: boolean
  clickable: boolean
  children: UiNode[]
}

// ── Parser XML minimal pour le format uiautomator dump ──────────────────

function parseAttr(attrStr: string, name: string): string {
  const re = new RegExp(`${name}="([^"]*)"`)
  return re.exec(attrStr)?.[1] ?? ''
}

function parseBounds(b: string): UiNode['bounds'] {
  const m = /\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(b)
  if (!m) return { left: 0, top: 0, right: 0, bottom: 0 }
  return { left: +m[1], top: +m[2], right: +m[3], bottom: +m[4] }
}

export function parseUiXml(xml: string): UiNode[] {
  const root: UiNode[] = []
  const stack: UiNode[] = []
  // Tokenise toutes les balises <node ...>, </node>, <hierarchy ...>, </hierarchy>
  const tokenRe = /<(\/?)(node|hierarchy)([^>]*?)(\/?)>/gs
  let m: RegExpExecArray | null

  while ((m = tokenRe.exec(xml)) !== null) {
    const [, closing, tag, attrStr, selfClose] = m
    if (tag === 'hierarchy') continue

    if (closing) {
      const child = stack.pop()
      if (!child) continue
      if (stack.length > 0) stack[stack.length - 1].children.push(child)
      else root.push(child)
    } else {
      const node: UiNode = {
        text: parseAttr(attrStr, 'text'),
        resourceId: parseAttr(attrStr, 'resource-id'),
        className: parseAttr(attrStr, 'class'),
        bounds: parseBounds(parseAttr(attrStr, 'bounds')),
        checked: parseAttr(attrStr, 'checked') === 'true',
        selected: parseAttr(attrStr, 'selected') === 'true',
        clickable: parseAttr(attrStr, 'clickable') === 'true',
        children: [],
      }
      if (selfClose) {
        if (stack.length > 0) stack[stack.length - 1].children.push(node)
        else root.push(node)
      } else {
        stack.push(node)
      }
    }
  }

  return root
}

// ── Recherche dans l'arbre ──────────────────────────────────────────────

export function findByText(
  nodes: UiNode[],
  text: string,
  opts?: { exact?: boolean }
): UiNode | null {
  for (const node of nodes) {
    const match = opts?.exact
      ? node.text === text
      : node.text.toLowerCase().includes(text.toLowerCase())
    if (match) return node
    const found = findByText(node.children, text, opts)
    if (found) return found
  }
  return null
}

export function findAllByText(nodes: UiNode[], text: string, opts?: { exact?: boolean }): UiNode[] {
  const results: UiNode[] = []
  for (const node of nodes) {
    const match = opts?.exact
      ? node.text === text
      : node.text.toLowerCase().includes(text.toLowerCase())
    if (match) results.push(node)
    results.push(...findAllByText(node.children, text, opts))
  }
  return results
}

export function findByResourceId(nodes: UiNode[], resourceId: string): UiNode | null {
  for (const node of nodes) {
    if (node.resourceId === resourceId) return node
    const found = findByResourceId(node.children, resourceId)
    if (found) return found
  }
  return null
}

// ── Actions ADB ─────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

export async function dumpUiHierarchy(serial: string): Promise<UiNode[]> {
  await window.electronAPI.adb.shell(serial, 'uiautomator dump /sdcard/window_dump.xml')
  const xml = await window.electronAPI.adb.shell(serial, 'cat /sdcard/window_dump.xml')
  return parseUiXml(xml)
}

export async function tapNode(serial: string, node: UiNode): Promise<void> {
  const x = Math.floor((node.bounds.left + node.bounds.right) / 2)
  const y = Math.floor((node.bounds.top + node.bounds.bottom) / 2)
  await window.electronAPI.adb.shell(serial, `input tap ${x} ${y}`)
}

/**
 * Navigue dans l'UI en tapant successivement sur chaque libellé de `steps`.
 * Relit la hiérarchie entre chaque tap pour gérer les changements d'écran.
 * Lève une erreur si un nœud est introuvable après `settleMs` ms.
 */
export async function navigateByTextPath(
  serial: string,
  steps: string[],
  settleMs = 900
): Promise<void> {
  for (const label of steps) {
    await sleep(settleMs)
    const nodes = await dumpUiHierarchy(serial)
    const node = findByText(nodes, label)
    if (!node) {
      throw new Error(`UI: nœud introuvable pour "${label}"`)
    }
    await tapNode(serial, node)
  }
}
