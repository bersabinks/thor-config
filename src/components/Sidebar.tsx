import { useSettings } from '../store/settings'

type Page =
  | 'configure'
  | 'guide'
  | 'home'
  | 'emulators'
  | 'roms'
  | 'saves'
  | 'vita'
  | 'launcher'
  | 'utilities'
  | 'report'
  | 'settings'

interface SidebarProps {
  activePage: Page
  onNavigate: (page: Page) => void
}

const NAV_ITEMS: { id: Page; label: string; icon: string; available: boolean }[] = [
  { id: 'configure', label: 'Configurer ma console', icon: '⚡', available: true },
  { id: 'guide', label: 'Guide & Checklist', icon: '📖', available: true },
  { id: 'home', label: 'Préparation', icon: '⚙', available: true },
  { id: 'emulators', label: 'Émulateurs', icon: '🎮', available: true },
  { id: 'roms', label: 'ROMs', icon: '💿', available: true },
  { id: 'saves', label: 'Sauvegardes', icon: '💾', available: true },
  { id: 'vita', label: 'PS Vita', icon: '🎯', available: true },
  { id: 'launcher', label: 'Launcher', icon: '🚀', available: true },
  { id: 'utilities', label: 'Utilitaires', icon: '🛠', available: true },
  { id: 'report', label: 'Rapport final', icon: '📋', available: true },
]

export function Sidebar({ activePage, onNavigate }: SidebarProps) {
  const { simulationMode, setSimulationMode } = useSettings()

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <span className="logo-text">ThorConfig</span>
        <span className="logo-sub">AYN Thor Max</span>
      </div>

      <nav className="sidebar-nav">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${activePage === item.id ? 'nav-item--active' : ''} ${!item.available ? 'nav-item--disabled' : ''}`}
            onClick={() => item.available && onNavigate(item.id)}
            disabled={!item.available}
            title={!item.available ? 'Disponible dans une prochaine version' : undefined}
          >
            <span className="nav-icon">{item.icon}</span>
            <span className="nav-label">{item.label}</span>
            {!item.available && <span className="nav-soon">bientôt</span>}
          </button>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-mode-box">
          <div className="sidebar-mode-box-header">
            <span>Mode de travail</span>
            <span className={simulationMode ? 'badge-sim-dot' : 'badge-real-dot'}>
              {simulationMode ? 'Simu' : 'Réel'}
            </span>
          </div>
          <div className="sidebar-mode-switch">
            <button
              type="button"
              className={`sidebar-mode-btn ${simulationMode ? 'active-sim' : ''}`}
              onClick={() => setSimulationMode(true)}
              title="Activer le mode simulation (console virtuelle)"
            >
              🧪 Simu
            </button>
            <button
              type="button"
              className={`sidebar-mode-btn ${!simulationMode ? 'active-real' : ''}`}
              onClick={() => setSimulationMode(false)}
              title="Activer le mode réel (console AYN Thor USB)"
            >
              ⚡ Réel
            </button>
          </div>
        </div>

        <button
          className={`nav-item ${activePage === 'settings' ? 'nav-item--active' : ''}`}
          onClick={() => onNavigate('settings')}
        >
          <span className="nav-icon">⚙</span>
          <span className="nav-label">Réglages</span>
        </button>
      </div>
    </aside>
  )
}
