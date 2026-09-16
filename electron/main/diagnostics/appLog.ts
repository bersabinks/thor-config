import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { inspect } from 'util'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogSource = 'main' | 'renderer'

const pad = (n: number) => String(n).padStart(2, '0')

/** Un fichier par jour (date locale) : app-AAAA-MM-JJ.log. */
export function logFileName(date: Date = new Date()): string {
  return `app-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}.log`
}

export function formatLogLine(level: LogLevel, source: LogSource, args: unknown[], date: Date = new Date()): string {
  const text = args
    .map((a) => (typeof a === 'string' ? a : inspect(a, { depth: 4, breakLength: Infinity })))
    .join(' ')
  return `${date.toISOString()} [${level.toUpperCase()}] [${source}] ${text}\n`
}

export interface AppLogger {
  write(level: LogLevel, source: LogSource, args: unknown[]): void
  readToday(): string | null
}

/**
 * Journal fichier synchrone (appendFileSync) : les lignes restent dans l'ordre
 * et sont lisibles immédiatement par l'export de diagnostic. Jamais bloquant.
 */
export function createAppLogger(dir: string, now: () => Date = () => new Date()): AppLogger {
  return {
    write(level, source, args) {
      try {
        mkdirSync(dir, { recursive: true })
        const date = now()
        appendFileSync(join(dir, logFileName(date)), formatLogLine(level, source, args, date))
      } catch {
        /* un disque plein ne doit pas faire planter l'application */
      }
    },
    readToday() {
      const p = join(dir, logFileName(now()))
      return existsSync(p) ? readFileSync(p, 'utf-8') : null
    },
  }
}

let logger: AppLogger | null = null

/** Duplique console.* du process main dans le journal du jour. */
export function initAppLog(dir: string): AppLogger {
  if (logger) return logger
  const l = createAppLogger(dir)
  logger = l
  const methods: Array<['log' | 'info' | 'warn' | 'error', LogLevel]> = [
    ['log', 'info'],
    ['info', 'info'],
    ['warn', 'warn'],
    ['error', 'error'],
  ]
  const target = console as unknown as Record<string, (...args: unknown[]) => void>
  for (const [method, level] of methods) {
    const original = target[method].bind(console)
    target[method] = (...args: unknown[]) => {
      original(...args)
      l.write(level, 'main', args)
    }
  }
  return l
}

const RENDERER_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error']

/** Messages console du renderer (événement webContents « console-message »). */
export function logRendererMessage(level: number, message: string, sourceId: string, line: number): void {
  logger?.write(RENDERER_LEVELS[level] ?? 'info', 'renderer', [`${message} (${sourceId}:${line})`])
}

export function readTodayLog(): string | null {
  return logger?.readToday() ?? null
}
