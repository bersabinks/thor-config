import { useSettings } from '../store/settings'

export function Settings() {
  const {
    simulationMode, setSimulationMode,
    aynAbxyLayout, setAynAbxyLayout,
    aynTriggerMode, setAynTriggerMode,
    firmwareUpdateWaitSeconds, setFirmwareUpdateWaitSeconds,
    importFolder, setImportFolder,
    romsParallelism, setRomsParallelism,
    vitaOutputFolder, setVitaOutputFolder,
  } = useSettings()

  async function handlePickImportFolder() {
    const folder = await window.electronAPI.roms.pickImportFolder()
    if (folder) await setImportFolder(folder)
  }

  async function handlePickVitaOutputFolder() {
    const folder = await window.electronAPI.roms.pickImportFolder()
    if (folder) await setVitaOutputFolder(folder)
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>Réglages</h2>
          <p className="page-desc">Configuration de l'application ThorConfig.</p>
        </div>
      </div>

      <div className="page-content">

        {/* ── Mode simulation ── */}
        <div className="card">
          <div className="card-header">
            <h3>Mode simulation</h3>
            <p className="card-desc">
              Utilise un appareil fictif "AYN Thor Max (simulation)" avec toutes les commandes
              ADB mockées. Idéal pour tester sans console physique.
            </p>
          </div>
          <div className="card-body">
            <label className="toggle-label">
              <span>Activer le mode simulation</span>
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

        {/* ── Préférences AYN ── */}
        <div className="card">
          <div className="card-header">
            <h3>Préférences AYN Settings</h3>
            <p className="card-desc">
              Ces valeurs sont appliquées lors de l'étape "AYN Settings" du module Préparation.
              Elles sont envoyées à la console via UI Automator.
            </p>
          </div>
          <div className="card-body">
            <div className="settings-row">
              <div className="settings-row-label">
                <span>Layout des boutons ABXY</span>
                <span>Disposition physique gravée sur les boutons</span>
              </div>
              <div className="segmented">
                <button
                  className={aynAbxyLayout === 'Xbox' ? 'active' : ''}
                  onClick={() => setAynAbxyLayout('Xbox')}
                >
                  Xbox
                </button>
                <button
                  className={aynAbxyLayout === 'Nintendo' ? 'active' : ''}
                  onClick={() => setAynAbxyLayout('Nintendo')}
                >
                  Nintendo
                </button>
              </div>
            </div>

            <div className="settings-row">
              <div className="settings-row-label">
                <span>Mode des gâchettes</span>
                <span>Analog = axe continu, Digital = bouton on/off</span>
              </div>
              <div className="segmented">
                <button
                  className={aynTriggerMode === 'Analog' ? 'active' : ''}
                  onClick={() => setAynTriggerMode('Analog')}
                >
                  Analog
                </button>
                <button
                  className={aynTriggerMode === 'Digital' ? 'active' : ''}
                  onClick={() => setAynTriggerMode('Digital')}
                >
                  Digital
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Firmware update ── */}
        <div className="card">
          <div className="card-header">
            <h3>Mise à jour firmware</h3>
            <p className="card-desc">
              Délai d'attente après le déclenchement de la vérification OTA avant de
              re-tester la connectivité ADB (en secondes).
            </p>
          </div>
          <div className="card-body">
            <div className="settings-row">
              <div className="settings-row-label">
                <span>Délai d'attente OTA</span>
                <span>Augmenter si la console prend du temps à redémarrer</span>
              </div>
              <div className="number-input">
                <input
                  type="number"
                  min={5}
                  max={300}
                  value={firmwareUpdateWaitSeconds}
                  onChange={(e) => setFirmwareUpdateWaitSeconds(Number(e.target.value))}
                />
                <span className="hint">sec</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── ROMs ── */}
        <div className="card">
          <div className="card-header">
            <h3>ROMs — Dossier d'import</h3>
            <p className="card-desc">
              Dossier local surveillé : tout fichier de jeu déposé ici est identifié, rangé et
              transféré automatiquement sur la console.
            </p>
          </div>
          <div className="card-body">
            <div className="settings-row">
              <div className="settings-row-label">
                <span>Dossier d'import</span>
                <span>{importFolder || 'Aucun dossier sélectionné'}</span>
              </div>
              <button className="btn-ghost btn-sm" onClick={handlePickImportFolder}>
                {importFolder ? 'Changer…' : 'Choisir…'}
              </button>
            </div>

            <div className="settings-row">
              <div className="settings-row-label">
                <span>Parallélisme des transferts</span>
                <span>Nombre de fichiers traités en parallèle (limite le débit USB)</span>
              </div>
              <div className="number-input">
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={romsParallelism}
                  onChange={(e) => setRomsParallelism(Number(e.target.value))}
                />
                <span className="hint">fichiers</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── PS Vita ── */}
        <div className="card">
          <div className="card-header">
            <h3>PS Vita — Sortie PC</h3>
            <p className="card-desc">
              Quand Vita3K n'est pas installé sur la console, les fichiers .vpk et .dpt générés
              sont copiés dans ce dossier local pour un Vita3K sur PC.
            </p>
          </div>
          <div className="card-body">
            <div className="settings-row">
              <div className="settings-row-label">
                <span>Dossier de sortie</span>
                <span>{vitaOutputFolder || 'Par défaut : Documents\\ThorConfig\\PSVita'}</span>
              </div>
              <div>
                {vitaOutputFolder && (
                  <button className="btn-ghost btn-sm" onClick={() => setVitaOutputFolder('')}>
                    Par défaut
                  </button>
                )}
                <button className="btn-ghost btn-sm" onClick={handlePickVitaOutputFolder}>
                  {vitaOutputFolder ? 'Changer…' : 'Choisir…'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Labels AYN ── */}
        <div className="card">
          <div className="card-header">
            <h3>Ajustement des labels AYN</h3>
            <p className="card-desc">
              Si les libellés visibles dans l'app AYN Settings diffèrent (ex. firmware différent),
              modifiez le fichier{' '}
              <code>src/modules/prepare/aynMenuLabels.json</code> pour les faire correspondre
              exactement aux textes affichés sur la console.
            </p>
          </div>
        </div>

        {/* ── À propos ── */}
        <div className="card">
          <div className="card-header">
            <h3>À propos</h3>
          </div>
          <div className="card-body">
            <p className="hint">ThorConfig v1.0.0 — Prompts 1 et 2 implémentés</p>
            <p className="hint">
              Modules à venir : Émulateurs · ROMs · Sauvegardes · PS Vita · Launcher
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
