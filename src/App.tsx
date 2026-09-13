import { useEffect, useState } from 'react'
import { Sidebar } from './components/Sidebar'
import { Home } from './pages/Home'
import { Emulators } from './pages/Emulators'
import { Settings } from './pages/Settings'
import { useSettings } from './store/settings'

type Page = 'home' | 'emulators' | 'roms' | 'saves' | 'vita' | 'launcher' | 'report' | 'settings'

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
  const [activePage, setActivePage] = useState<Page>('home')
  const load = useSettings((s) => s.load)

  useEffect(() => {
    load()
  }, [load])

  function renderPage() {
    switch (activePage) {
      case 'home':
        return <Home />
      case 'emulators':
        return <Emulators />
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
