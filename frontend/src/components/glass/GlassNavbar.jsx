import { useTheme } from '../../context/ThemeContext'
import { MenuIcon, MoonIcon, SearchIcon, SunIcon } from '../icons'

const isMac = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform || navigator.userAgent)

export function GlassNavbar({ onToggleSidebar, onOpenPalette, title }) {
  const { theme, cycleTheme } = useTheme()

  return (
    <header className="glass-navbar">
      <button type="button" className="glass-btn icon-only ghost" aria-label="Toggle sidebar" onClick={onToggleSidebar}>
        <MenuIcon size={18} />
      </button>

      {title && <h2 style={{ margin: 0, fontSize: '1.05rem' }}>{title}</h2>}

      <button type="button" className="glass-navbar-search" onClick={onOpenPalette}>
        <SearchIcon size={15} />
        <span>Search or jump to…</span>
        <kbd>{isMac ? '⌘K' : 'Ctrl+K'}</kbd>
      </button>

      <button type="button" className="glass-btn icon-only ghost" aria-label="Toggle theme" onClick={cycleTheme} title={`Theme: ${theme}`}>
        {theme === 'dark' ? <MoonIcon size={17} /> : <SunIcon size={17} />}
      </button>
    </header>
  )
}
