import { EMULATOR_GUIDES, UTILITY_GUIDES } from '../modules/orchestrator'
import {
  reportToJson,
  reportToMarkdown,
  type ModuleResult,
  type ReportSummary,
  type ReportMeta,
} from '../modules/orchestrator'
import type { ModuleStatus } from '../modules/orchestrator'

interface Props {
  report: ReportSummary
  modules: ModuleResult[]
  meta: ReportMeta
  onRerunFailed?: () => void
  rerunning?: boolean
  hasFailures: boolean
}

const STATUS_LABEL: Record<ModuleStatus, string> = {
  success: 'réussi',
  partial: 'partiel',
  failed: 'échec',
  skipped: 'ignoré',
}

function download(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Émulateurs effectivement installés lors du run → guides pertinents à afficher. */
function installedGuides(modules: ModuleResult[]) {
  const emulators = modules.find((m) => m.moduleId === 'emulators')
  if (!emulators) return []
  return EMULATOR_GUIDES.filter((g) =>
    emulators.steps.some((s) => s.label === `${g.displayName} — Installation` && s.status === 'success')
  )
}

function installedUtilityGuides(modules: ModuleResult[]) {
  const utilities = modules.find((m) => m.moduleId === 'utilities')
  if (!utilities) return []
  return UTILITY_GUIDES.filter((g) =>
    utilities.steps.some(
      (s) =>
        s.label.startsWith(`${g.displayName} — `) &&
        (s.status === 'success' || s.status === 'skipped')
    )
  )
}

export function FinalReport({ report, modules, meta, onRerunFailed, rerunning, hasFailures }: Props) {
  const { totals } = report
  const guides = installedGuides(modules)
  const utilityGuides = installedUtilityGuides(modules)

  const failures = report.perModule.filter((m) => m.failures.length > 0)

  return (
    <>
      {/* ── Score global ────────────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h3>Rapport final</h3>
          <p className="card-desc">
            Score = vérifications réussies sur vérifications décisives. Les étapes{' '}
            <strong>ignorées</strong> (non automatisables sans root) ne comptent pas comme des
            échecs — elles restent à faire manuellement.
          </p>
        </div>
        <div className="card-body">
          <div className="score-card">
            <div className="score-value">
              <span className="score-number">{report.scoreLabel}</span>
              <span className="score-caption">{report.scorePercent} % des vérifications décisives</span>
            </div>
            <div className="score-bar">
              <div className="score-bar__fill" style={{ width: `${report.scorePercent}%` }} />
            </div>
          </div>

          <div className="score-chips" style={{ marginTop: 16 }}>
            <span className="chip chip--success">✓ <b>{totals.success}</b> réussies</span>
            <span className="chip chip--skipped">– <b>{totals.skipped}</b> ignorées</span>
            <span className="chip chip--failed">✗ <b>{totals.failed}</b> échouées</span>
          </div>

          <div className="log-actions" style={{ gap: 10, marginTop: 16 }}>
            <button
              className="btn-ghost btn-sm"
              onClick={() =>
                download('thorconfig-rapport.json', reportToJson(report, modules, meta), 'application/json')
              }
            >
              Exporter JSON
            </button>
            <button
              className="btn-ghost btn-sm"
              onClick={() =>
                download('thorconfig-rapport.md', reportToMarkdown(report, meta), 'text/markdown')
              }
            >
              Exporter Markdown
            </button>
            {hasFailures && onRerunFailed && (
              <button className="btn-primary" onClick={onRerunFailed} disabled={rerunning}>
                {rerunning && <span className="spinner" />}
                Relancer les modules en échec
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Détail par module ───────────────────────────────────────────── */}
      <div className="card">
        <div className="card-header">
          <h3>Détail par module</h3>
        </div>
        <div className="card-body">
          <div className="report-modules">
            {report.perModule.map((m) => (
              <div key={m.moduleId} className="report-module">
                <span className="report-module__name">{m.displayName}</span>
                <span className="report-module__counts">
                  <span className="ok">✓ {m.tally.success}</span>
                  <span className="sk">– {m.tally.skipped}</span>
                  <span className="er">✗ {m.tally.failed}</span>
                </span>
                <span className={`status-pill status-pill--${m.status}`}>{STATUS_LABEL[m.status]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Échecs à revoir ─────────────────────────────────────────────── */}
      {failures.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Échecs à revoir</h3>
            <p className="card-desc">
              Ces vérifications n'ont pas abouti après plusieurs tentatives. La relance ne rejoue que
              les modules concernés, sans toucher aux étapes déjà réussies.
            </p>
          </div>
          <div className="card-body">
            {failures.map((m) => (
              <div key={m.moduleId} style={{ marginBottom: 12 }}>
                <div className="step-label" style={{ marginBottom: 6 }}>{m.displayName}</div>
                {m.failures.map((f, i) => (
                  <div key={`${f.label}-${i}`} className="failure-item">
                    <div className="failure-item__label">{f.label}</div>
                    {f.error && <div className="failure-item__error">{f.error}</div>}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Guide de configuration guidée des émulateurs ────────────────── */}
      {guides.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Configuration guidée des émulateurs</h3>
            <p className="card-desc">
              Les réglages des émulateurs vivent dans <code>/data/data/…</code> et ne sont pas
              modifiables par ADB sans root (confirmé par enquête). À faire une fois, à la main, dans
              chaque émulateur installé — les valeurs ci-dessous correspondent aux profils cibles.
            </p>
          </div>
          <div className="card-body">
            {guides.map((g) => (
              <div key={g.id} className="guide-emulator">
                <div className="guide-emulator__title">{g.displayName}</div>
                <div className="guide-emulator__intro">{g.intro}</div>
                <div className="guide-settings">
                  {g.settings.map((s) => (
                    <div key={s.path} className="guide-setting">
                      <span className="guide-setting__path">{s.path}</span>
                      <span className="guide-setting__value">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recommandations pour les utilitaires ──────────────────────────── */}
      {utilityGuides.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3>Recommandations pour les utilitaires</h3>
            <p className="card-desc">
              Conseils d'utilisation et profils recommandés pour les utilitaires installés sur votre AYN Thor Max.
            </p>
          </div>
          <div className="card-body">
            {utilityGuides.map((g) => (
              <div key={g.id} className="guide-emulator">
                <div className="guide-emulator__title">{g.displayName}</div>
                <div className="guide-emulator__intro">{g.intro}</div>
                <div className="guide-settings">
                  {g.settings.map((s) => (
                    <div key={s.path} className="guide-setting">
                      <span className="guide-setting__path">{s.path}</span>
                      <span className="guide-setting__value">{s.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
