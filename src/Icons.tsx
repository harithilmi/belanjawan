// Small macOS-style icons, drawn by hand as SVG.

export const FolderIcon = ({ open = false }: { open?: boolean }) => (
  <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true">
    <path d="M1 3a1.5 1.5 0 0 1 1.5-1.5h3.2l1.5 1.5h6.3A1.5 1.5 0 0 1 15 4.5V12a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12z" fill="#5eb3f6" />
    <path d={open ? 'M1 6.5h14V12a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12z' : 'M1 5h14v7a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 1 12z'} fill="#8fcdfb" />
  </svg>
)

export const FileIcon = () => (
  <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true">
    <path d="M2.5 0.5h6l4 4v10a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-13a1 1 0 0 1 1-1z" fill="#fff" stroke="#c7c7cc" />
    <path d="M8.5 0.5v4h4" fill="#f2f2f7" stroke="#c7c7cc" />
    <path d="M4 8h6M4 10.5h6M4 13h4" stroke="#aeaeb2" />
  </svg>
)

export const LockIcon = () => (
  <svg width="11" height="13" viewBox="0 0 11 13" aria-label="locked">
    <path d="M2.5 6V4a3 3 0 0 1 6 0v2" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <rect x="1" y="6" width="9" height="6.5" rx="1.5" fill="currentColor" />
  </svg>
)

export const BinIcon = ({ full }: { full: boolean }) => (
  <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
    <path d="M7 8h18l-1.6 20.2A2 2 0 0 1 21.4 30H10.6a2 2 0 0 1-2-1.8z" fill="#e5e5ea" stroke="#8e8e93" />
    <path d="M12.5 12v14M16 12v14M19.5 12v14" stroke="#aeaeb2" />
    {full && <path d="M9 8l3-5 4 3 3-4 4 6z" fill="#fff" stroke="#8e8e93" />}
    <rect x="5" y="6" width="22" height="3" rx="1.5" fill="#d1d1d6" stroke="#8e8e93" />
  </svg>
)

export const DriveIcon = () => (
  <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
    <rect x="3" y="9" width="34" height="22" rx="5" fill="#d1d1d6" />
    <rect x="3" y="9" width="34" height="14" rx="5" fill="#f2f2f7" />
    <circle cx="31" cy="26" r="1.6" fill="#34c759" />
  </svg>
)
