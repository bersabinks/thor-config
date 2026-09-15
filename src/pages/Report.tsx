import { ExecutionLog } from '../components/ExecutionLog'
import { useAuditLog } from '../store/auditLog'
import { tally } from '../modules/orchestrator'

/**
 * Rapport final de session : agrège toutes les étapes du journal (orchestrateur
 * ou modules lancés séparément) en un score et une répartition à 3 catégories.
 */
export function Report() {
  const steps = useAuditLog((s) => s.steps)
  const t = tally(steps)
  const scoreTotal = t.success + t.failed
  const percent = scoreTotal === 0 ? 100 : Math.round((t.success / scoreTotal) * 100)

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Rapport final</h2>
          <p className="page-desc">
            Synthèse de toutes les vérifications de la session en cours, réussies, ignorées et
            échouées.
          </p>
        </div>
      </div>

      <div className="page-content page-content--fill">
        <div className="card">
          <div className="card-header">
            <h3>Score de session</h3>
            <p className="card-desc">
              Réussies sur vérifications décisives. Les étapes ignorées (non automatisables sans root)
              sont comptées à part, jamais comme des échecs.
            </p>
          </div>
          <div className="card-body">
            {steps.length === 0 ? (
              <p className="hint">
                Aucune vérification pour l'instant. Lancez « Configurer ma console » ou un module.
              </p>
            ) : (
              <>
                <div className="score-card">
                  <div className="score-value">
                    <span className="score-number">
                      {t.success}/{scoreTotal}
                    </span>
                    <span className="score-caption">{percent} % des vérifications décisives</span>
                  </div>
                  <div className="score-bar">
                    <div className="score-bar__fill" style={{ width: `${percent}%` }} />
                  </div>
                </div>
                <div className="score-chips" style={{ marginTop: 16 }}>
                  <span className="chip chip--success">✓ <b>{t.success}</b> réussies</span>
                  <span className="chip chip--skipped">– <b>{t.skipped}</b> ignorées</span>
                  <span className="chip chip--failed">✗ <b>{t.failed}</b> échouées</span>
                </div>
              </>
            )}
          </div>
        </div>

        <ExecutionLog />
      </div>
    </div>
  )
}
