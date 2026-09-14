import { useEffect, useRef } from 'react'
import { useAuditLog } from '../store/auditLog'
import type { StepResult } from '../verification'

function StepRow({ step }: { step: StepResult }) {
  const skipped = step.status === 'skipped'
  const ok = step.status === 'success'
  const variant = ok ? 'success' : skipped ? 'skipped' : 'error'
  const icon = ok ? '✓' : skipped ? '–' : '✗'
  const className = `log-row log-row--${variant}`
  const time = new Date(step.timestamp).toLocaleTimeString('fr-FR')

  return (
    <div className={className}>
      <div className="log-row-main">
        <span className="log-icon">{icon}</span>
        <span className="log-label">{step.label}</span>
        <span className="log-meta">
          {skipped
            ? `ignoré · ${time}`
            : `${step.attempts} tentative${step.attempts > 1 ? 's' : ''} · ${time}`}
        </span>
      </div>
      {skipped && step.note && <div className="log-note">{step.note}</div>}
      {!ok && !skipped && step.error && <div className="log-error">{step.error}</div>}
    </div>
  )
}

export function ExecutionLog() {
  const steps = useAuditLog((s) => s.steps)
  const clearSteps = useAuditLog((s) => s.clearSteps)
  const exportAsJson = useAuditLog((s) => s.exportAsJson)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [steps])

  return (
    <div className="execution-log">
      <div className="log-header">
        <span>Journal d'exécution</span>
        <div className="log-actions">
          {steps.length > 0 && (
            <>
              <button className="btn-ghost btn-sm" onClick={() => {
                const blob = new Blob([exportAsJson()], { type: 'application/json' })
                const url = URL.createObjectURL(blob)
                const a = document.createElement('a')
                a.href = url
                a.download = 'thorconfig-audit.json'
                a.click()
                URL.revokeObjectURL(url)
              }}>
                Exporter JSON
              </button>
              <button className="btn-ghost btn-sm" onClick={clearSteps}>
                Effacer
              </button>
            </>
          )}
        </div>
      </div>
      <div className="log-body">
        {steps.length === 0 ? (
          <div className="log-empty">Aucune action exécutée pour l'instant.</div>
        ) : (
          steps.map((step, i) => <StepRow key={i} step={step} />)
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}
