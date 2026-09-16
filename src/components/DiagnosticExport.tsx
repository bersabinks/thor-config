import { useState } from 'react'
import { useAuditLog } from '../store/auditLog'
import { describeError } from '../../electron/main/adb/errors'
import type { DiagnosticPackResult } from '../../electron/main/diagnostics/diagnosticPack'

/**
 * Bouton « Exporter le diagnostic (.zip) » : journal d'audit, logs Electron du
 * jour, getprop et dernier dump UI de la console. Affiche le SHA-256 du zip pour
 * que le testeur puisse le communiquer avec le fichier.
 */
export function DiagnosticExport() {
  const exportAsJson = useAuditLog((s) => s.exportAsJson)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<DiagnosticPackResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function handleExport() {
    setBusy(true)
    setError(null)
    try {
      const r = await window.electronAPI.diagnostics.export(exportAsJson())
      if (r) setResult(r)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="diagnostic-export">
      <button className="btn-ghost btn-sm" onClick={handleExport} disabled={busy}>
        {busy && <span className="spinner" />}
        Exporter le diagnostic (.zip)
      </button>
      {result && (
        <div className="diagnostic-result">
          <div className="hint">
            Enregistré : <code>{result.path}</code> — {result.entries.join(', ')}
          </div>
          <div className="hint">
            SHA-256 : <code className="hash">{result.sha256}</code>
          </div>
        </div>
      )}
      {error && <div className="failure-item__error">Export impossible : {error}</div>}
    </div>
  )
}
