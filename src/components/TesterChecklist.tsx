import { useState } from 'react'
import type { AdbDevice } from '../../electron/main/adb/types'

interface Props {
  device: AdbDevice | null
  defaultExpanded?: boolean
}

export function TesterChecklist({ device, defaultExpanded = true }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const isAuthorized = device?.state === 'device'
  const isUnauthorized = device?.state === 'unauthorized'

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      <div
        className="card-header"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <div>
          <h3>📋 Guide & Checklist pour le testeur (AYN Thor Max)</h3>
          <p className="card-desc">
            Instructions étape par étape pour préparer la console, autoriser la connexion ADB et réussir le test.
          </p>
        </div>
        <button
          className="btn-secondary"
          style={{ fontSize: 12, padding: '4px 10px', marginLeft: 16 }}
          onClick={(e) => {
            e.stopPropagation()
            setExpanded(!expanded)
          }}
        >
          {expanded ? '▲ Masquer' : '▼ Déplier la checklist'}
        </button>
      </div>

      {expanded && (
        <div className="card-body">
          {/* État de connexion ADB interactif */}
          {isUnauthorized && (
            <div
              className="alert-box"
              style={{
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid var(--warning)',
                borderRadius: 6,
                padding: '12px 16px',
                marginBottom: 16,
              }}
            >
              <div style={{ fontWeight: 600, color: 'var(--warning)', marginBottom: 4 }}>
                ⚠️ Console détectée mais non autorisée !
              </div>
              <div style={{ fontSize: 13, color: 'var(--text)' }}>
                Regardez l’écran de votre AYN Thor Max : une pop-up « Autoriser le débogage USB ? » est affichée.
                Cochez impérativement <strong>« Toujours autoriser depuis cet ordinateur »</strong> puis appuyez sur <strong>OK</strong>.
              </div>
            </div>
          )}

          {isAuthorized && (
            <div
              className="alert-box"
              style={{
                background: 'rgba(34, 197, 94, 0.15)',
                border: '1px solid var(--success)',
                borderRadius: 6,
                padding: '10px 14px',
                marginBottom: 16,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span style={{ fontSize: 16 }}>✓</span>
              <span style={{ fontSize: 13, color: 'var(--success)' }}>
                <strong>Console connectée et autorisée ({device.model}) !</strong> Vous pouvez lancer la configuration ci-dessous.
              </span>
            </div>
          )}

          <div className="prepare-steps" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Étape 1 */}
            <div className="prepare-step prepare-step--success">
              <div className="step-icon-wrap">
                <span className="step-num">1</span>
              </div>
              <div className="step-text">
                <span className="step-label">Activer les Options pour les développeurs</span>
                <span className="step-desc">
                  Sur la console, allez dans <strong>Paramètres</strong> &gt; <strong>À propos de la console</strong> (tout en bas).
                  Appuyez <strong>7 fois</strong> rapidement sur la ligne <strong>Numéro de build</strong>. Un message indiquera
                  « Vous êtes désormais un développeur ! ».
                </span>
              </div>
            </div>

            {/* Étape 2 */}
            <div className="prepare-step prepare-step--success">
              <div className="step-icon-wrap">
                <span className="step-num">2</span>
              </div>
              <div className="step-text">
                <span className="step-label">Activer le Débogage USB</span>
                <span className="step-desc">
                  Toujours dans les Paramètres, allez dans <strong>Système</strong> &gt; <strong>Options pour les développeurs</strong>.
                  Faites défiler jusqu'à la section « Débogage » et activez l'interrupteur <strong>Débogage USB</strong>.
                </span>
              </div>
            </div>

            {/* Étape 3 */}
            <div className={`prepare-step ${isAuthorized ? 'prepare-step--success' : isUnauthorized ? 'prepare-step--failed' : ''}`}>
              <div className="step-icon-wrap">
                <span className="step-num">${isAuthorized ? '✓' : '3'}</span>
              </div>
              <div className="step-text">
                <span className="step-label">Brancher le câble USB et autoriser le PC</span>
                <span className="step-desc">
                  Reliez la console au PC avec un câble USB de données. Dès que la pop-up apparaît sur l'écran tactile de la console,
                  cochez <strong>« Toujours autoriser cet ordinateur »</strong> et validez.
                </span>
              </div>
            </div>

            {/* Étape 4 */}
            <div className="prepare-step">
              <div className="step-icon-wrap">
                <span className="step-num">4</span>
              </div>
              <div className="step-text">
                <span className="step-label">Dossier de jeux / ROMs (Optionnel)</span>
                <span className="step-desc">
                  Si vous voulez tester le transfert automatique de jeux, déposez vos ROMs (NDS, 3DS, GameCube, Wii, Wii U, PS1, PS2, PSP, archives PS Vita)
                  dans un dossier sur votre PC et sélectionnez-le dans l'onglet <strong>Réglages</strong> de ThorConfig.
                </span>
              </div>
            </div>

            {/* Étape 5 */}
            <div className="prepare-step">
              <div className="step-icon-wrap">
                <span className="step-num">5</span>
              </div>
              <div className="step-text">
                <span className="step-label">Lancer « Configurer ma console »</span>
                <span className="step-desc">
                  Cliquez sur le bouton bleu ci-dessous. ThorConfig déroule les 8 étapes dans l'ordre sans rien demander.
                  Le processus prend de 2 à 5 minutes selon votre connexion Internet.
                </span>
              </div>
            </div>

            {/* Étape 6 */}
            <div className="prepare-step">
              <div className="step-icon-wrap">
                <span className="step-num">6</span>
              </div>
              <div className="step-text">
                <span className="step-label">Vérification et rapport diagnostic</span>
                <span className="step-desc">
                  À la fin, consultez les guides de réglages double écran dans le <strong>Rapport final</strong>.
                  Si un problème survient, cliquez sur <strong>Exporter le diagnostic</strong> (.zip) pour l'envoyer au développeur.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
