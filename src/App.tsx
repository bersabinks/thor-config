import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { Configure } from './pages/Configure'
import { Home } from './pages/Home'
import { Emulators } from './pages/Emulators'
import { Roms } from './pages/Roms'
import { Saves } from './pages/Saves'
import { Vita } from './pages/Vita'
import { Launcher } from './pages/Launcher'
import { Report } from './pages/Report'
import { Settings } from './pages/Settings'
import { useSettings } from './store/settings'

type Page =
  | 'configure'
  | 'home'
  | 'emulators'
  | 'roms'
  | 'saves'
  | 'vita'
  | 'launcher'
  | 'report'
  | 'settings'

function ComingSoon({ name }: { name: string }) {
  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h2>{name}</h2>
          <p className="page-desc">Ce module sera disponible dans une prochaine version.</p>
        </div>
      </div>
    </div>
  )
}

export function App() {
  const [activePage, setActivePage] = useState<Page>('configure')
  const load = useSettings((s) => s.load)

  useEffect(() => {
    load()
  }, [load])

  function renderPage() {
    switch (activePage) {
      case 'configure':
        return <Configure />
      case 'home':
        return <Home />
      case 'emulators':
        return <Emulators />
      case 'roms':
        return <Roms />
      case 'saves':
        return <Saves />
      case 'vita':
        return <Vita />
      case 'launcher':
        return <Launcher />
      case 'report':
        return <Report />
      case 'settings':
        return <Settings />
      default:
        return <ComingSoon name={activePage} />
    }
  }

  return (
    <div className="app-shell">
      <Sidebar activePage={activePage} onNavigate={setActivePage} />
      <main className="main-area">{renderPage()}</main>
    </div>
  )
}
