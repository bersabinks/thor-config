import { useSettings } from '../store/settings'

export function Settings() {
  const { simulationMode, setSimulationMode } = useSettings()

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Réglages</h2>
          <p className="page-desc">Configuration de l'application ThorConfig.</p>
        </div>
      </div>

      <div className="page-content">
        <div className="card">
          <div className="card-header">
            <h3>Mode simulation</h3>
            <p className="card-desc">
              En mode simulation, un appareil fictice "AYN Thor Max (simulation)" est utilisé à la
              place d'une vraie console. Toutes les commandes ADB sont mockées et journalisées.
            </p>
          </div>
          <div className="card-body">
            <label className="toggle-label">
              <span>Mode simulation</span>
              <div className="toggle-wrapper">
                <input
                  type="checkbox"
                  className="toggle-input"
                  checked={simulationMode}
                  onChange={(e) => setSimulationMode(e.target.checked)}
                />
                <span className="toggle-track">
                  <span className="toggle-thumb" />
                </span>
              </div>
            </label>
            <p className="hint">
              {simulationMode
                ? '✓ Mode simulation actif — aucun appareil physique requis.'
                : '⚠ Mode réel — connectez votre AYN Thor Max via USB avec le débogage ADB activé.'}
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>Fichiers de fixtures</h3>
            <p className="card-desc">
              Les réponses simulées sont configurables dans{' '}
              <code>src/mocks/fixtures.ts</code>. Modifiez ce fichier pour ajuster les
              comportements du mock (délais, valeurs retournées, paquets installés).
            </p>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h3>À propos</h3>
          </div>
          <div className="card-body">
            <p className="hint">ThorConfig v1.0.0 — Prompt 1 implémenté</p>
            <p className="hint">Modules à venir : Préparation · Émulateurs · ROMs · Sauvegardes · PS Vita · Launcher</p>
          </div>
        </div>
      </div>
    </div>
  )
}
