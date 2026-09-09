/* A small, self-contained SVG icon set - no icon library dependency.
 * Every icon accepts `size` (shorthand for width+height) plus any other
 * svg prop (className, style, etc.). */

function icon(paths, viewBox = '0 0 24 24') {
  return function Icon({ size = 16, filled, ...rest }) {
    return (
      <svg viewBox={viewBox} width={size} height={size} fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2} {...rest}>
        {paths}
      </svg>
    )
  }
}

export const LogoIcon = ({ size = 18, ...rest }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" {...rest}>
    <path d="M12 2 9.5 8.5 3 11l6.5 2.5L12 20l2.5-6.5L21 11l-6.5-2.5Z" />
  </svg>
)

export const DashboardIcon = icon(
  <>
    <rect x="3" y="3" width="8" height="8" rx="2" />
    <rect x="13" y="3" width="8" height="5" rx="2" />
    <rect x="13" y="12" width="8" height="9" rx="2" />
    <rect x="3" y="15" width="8" height="6" rx="2" />
  </>
)
export const PlusIcon = icon(<path d="M12 5v14M5 12h14" strokeLinecap="round" />)
export const FolderIcon = icon(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" strokeLinejoin="round" />)
export const LinkIcon = icon(
  <path
    d="M9 15 15 9M10.5 6.5 12 5a4 4 0 1 1 5.7 5.7l-1.7 1.6M13.5 17.5 12 19a4 4 0 1 1-5.7-5.7l1.7-1.6"
    strokeLinecap="round"
  />
)
export const ClockIcon = icon(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 3" strokeLinecap="round" />
  </>
)
export const BotIcon = icon(
  <>
    <rect x="4" y="8" width="16" height="12" rx="3" />
    <path d="M12 8V4M9 4h6" strokeLinecap="round" />
    <circle cx="9" cy="14" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="15" cy="14" r="1.4" fill="currentColor" stroke="none" />
  </>
)
export const GearIcon = icon(
  <>
    <circle cx="12" cy="12" r="3" />
    <path
      d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </>
)
export const SearchIcon = icon(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" strokeLinecap="round" />
  </>
)
export const CloseIcon = icon(<path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />)
export const TrashIcon = icon(<path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13" strokeLinecap="round" strokeLinejoin="round" />)
export const BookmarkIcon = icon(<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z" strokeLinejoin="round" />)
export const CopyIcon = icon(
  <>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </>
)
export const DownloadIcon = icon(<path d="M12 3v13m0 0-4-4m4 4 4-4M4 19h16" strokeLinecap="round" strokeLinejoin="round" />)
export const CheckIcon = icon(<path d="m5 12 5 5 9-10" strokeLinecap="round" strokeLinejoin="round" />)
export const AlertIcon = icon(
  <>
    <path d="M12 9v4M12 17h.01" strokeLinecap="round" />
    <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" strokeLinejoin="round" />
  </>
)
export const ChevronDownIcon = icon(<path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />)
export const MenuIcon = icon(
  <>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <path d="M9 4v16" />
  </>
)
export const RefreshIcon = icon(<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" strokeLinecap="round" strokeLinejoin="round" />)
export const StopIcon = icon(<rect x="6" y="6" width="12" height="12" rx="2" />)
export const SunIcon = icon(
  <>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
  </>
)
export const MoonIcon = icon(<path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" strokeLinejoin="round" />)
export const ArchiveIcon = icon(
  <>
    <rect x="3" y="4" width="18" height="4" rx="1" />
    <path d="M5 8v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M10 13h4" strokeLinecap="round" />
  </>
)
export const UserIcon = icon(
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 20c1.5-4 5-6 8-6s6.5 2 8 6" strokeLinecap="round" />
  </>
)
export const ShieldIcon = icon(<path d="M12 3 4 6v6c0 5 3.5 7.5 8 9 4.5-1.5 8-4 8-9V6Z" strokeLinejoin="round" />)
export const SendIcon = icon(<path d="M12 19V5M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round" />)
export const CalculatorIcon = icon(
  <>
    <rect x="4" y="2" width="16" height="20" rx="2" />
    <path d="M8 6h8M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01" strokeLinecap="round" />
  </>
)
