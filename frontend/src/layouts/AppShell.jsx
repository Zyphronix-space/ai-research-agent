import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { CommandPalette } from '../components/CommandPalette'
import { GlassNavbar, GlassSidebar } from '../components/glass'

export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 880)
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    const onKeyDown = (e) => {
      const isCmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k'
      if (isCmdK) {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const closeSidebarOnMobile = () => {
    if (window.innerWidth <= 880) setSidebarOpen(false)
  }

  return (
    <div style={{ position: 'relative', display: 'flex', minHeight: '100dvh' }}>
      <div className="bg-blobs">
        <div className="bg-blob bg-blob-a" />
        <div className="bg-blob bg-blob-b" />
        <div className="bg-blob bg-blob-c" />
      </div>

      <button type="button" className="sidebar-scrim" aria-label="Close menu" data-open={sidebarOpen} onClick={() => setSidebarOpen(false)} />

      <GlassSidebar open={sidebarOpen} onNavigate={closeSidebarOnMobile} />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 1 }}>
        <GlassNavbar onToggleSidebar={() => setSidebarOpen((v) => !v)} onOpenPalette={() => setPaletteOpen(true)} />
        <main style={{ flex: 1, padding: 24, maxWidth: 1180, width: '100%', margin: '0 auto', boxSizing: 'border-box' }}>
          <Outlet />
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
