import { useSettings } from '../store/settings'
import { DiagnosticExport } from '../components/DiagnosticExport'
import { SUPPORTED_FRONTENDS } from '../modules/launcher'

export function Settings() {
  const {
    simulationMode, setSimulationMode,
    customAdbPath, setCustomAdbPath,
    aynAbxyLayout, setAynAbxyLayout,
    aynTriggerMode, setAynTriggerMode,
    firmwareUpdateWaitSeconds, setFirmwareUpdateWaitSeconds,
    importFolder, setImportFolder,
    romsParallelism, setRomsParallelism,
    vitaOutputFolder, setVitaOutputFolder,
    selectedLauncher, setSelectedLauncher,
  } = useSettings()

  async function handlePickAdbPath() {
    const file = await window.electronAPI.adb.pickAdbPath()
    if (file) await setCustomAdbPath(file)
  }

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

        {/* ── Chemin ADB personnalisé ── */}
        <div className="card">
          <div className="card-header">
            <h3>Chemin ADB personnalisé</h3>
            <p className="card-desc">
              Chemin complet vers l'exécutable <code>adb.exe</code>. Ce chemin est persisté et utilisé
              en priorité absolue sur toute autre détection automatique (WinGet, PATH, binaire interne).
            </p>
          </div>
          <div className="card-body">
            <div className="settings-row adb-input-row">
              <div className="adb-input-wrap">
                <input
                  type="text"
                  className="adb-path-input"
                  placeholder="Ex. C:\platform-tools\adb.exe ou coller le chemin WinGet"
                  value={customAdbPath}
                  onChange={(e) => setCustomAdbPath(e.target.value)}
                />
              </div>
              <div className="adb-input-actions">
                <button
                  type="button"
                  className="btn-ghost btn-sm"
                  onClick={handlePickAdbPath}
                  title="Parcourir vos dossiers pour sélectionner adb.exe"
                >
                  Parcourir…
                </button>
                {customAdbPath && (
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => setCustomAdbPath('')}
                    title="Effacer le chemin personnalisé et revenir à la détection automatique"
                  >
                    Effacer
                  </button>
                )}
              </div>
            </div>
            <p className="hint">
              {customAdbPath
                ? '✓ Chemin ADB personnalisé actif — utilisé en priorité 1 pour toutes les commandes ADB.'
                : 'Laisser vide pour la détection automatique (WinGet, ThorConfig interne, PATH, Chocolatey, Android SDK).'}
            </p>
          </div>
        </div>

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

        {/* ── Launcher & Frontend ── */}
        <div className="card">
          <div className="card-header">
            <h3>Launcher & Frontend (Interface de navigation)</h3>
            <p className="card-desc">
              Sélectionnez l'interface d'accueil principale pour votre AYN Thor. ThorConfig
              s'assure de son installation, la définit comme application Home par défaut et la lance automatiquement.
            </p>
          </div>
          <div className="card-body">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {Object.values(SUPPORTED_FRONTENDS).map((fe) => {
                const isSelected = (selectedLauncher || 'cocoon') === fe.id
                return (
                  <div
                    key={fe.id}
                    onClick={() => setSelectedLauncher(fe.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      padding: '12px 14px',
                      borderRadius: 'var(--radius)',
                      border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border)',
                      background: isSelected ? 'rgba(99, 102, 241, 0.1)' : 'rgba(255, 255, 255, 0.02)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <input
                      type="radio"
                      name="selectedLauncher"
                      checked={isSelected}
                      onChange={() => setSelectedLauncher(fe.id)}
                      style={{ marginTop: '3px', cursor: 'pointer' }}
                    />
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>{fe.displayName}</span>
                        {fe.badge && (
                          <span
                            style={{
                              fontSize: '11px',
                              padding: '2px 8px',
                              borderRadius: '10px',
                              background: fe.id === 'cocoon' ? 'var(--accent)' : 'rgba(255, 255, 255, 0.1)',
                              color: '#fff',
                              fontWeight: 500,
                            }}
                          >
                            {fe.badge}
                          </span>
                        )}
                      </div>
                      <p style={{ margin: 0, fontSize: '13px', color: 'var(--text-muted)' }}>
                        {fe.description}
                      </p>
                      <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>
                        {fe.apkSource
                          ? '✓ Installation automatique depuis GitHub (si absent).'
                          : 'ℹ Sideload requis (Patreon / Amazon Appstore). ThorConfig active et définit le Home.'}
                      </p>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* ── Diagnostic ── */}
        <div className="card">
          <div className="card-header">
            <h3>Diagnostic</h3>
            <p className="card-desc">
              Génère une archive .zip (journal d'audit, logs du jour, <code>adb shell getprop</code>,
              dernier dump UI Automator) à envoyer au développeur. Son empreinte SHA-256 est affichée
              pour vérifier que le fichier reçu est intact.
            </p>
          </div>
          <div className="card-body">
            <DiagnosticExport />
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
