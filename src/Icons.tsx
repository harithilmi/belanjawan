// Tiny pixel-ish Win98 icons, drawn by hand as SVG.

export const FolderIcon = ({ open = false }: { open?: boolean }) => (
  <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true">
    <path d="M0.5 2.5h5l1 1.5h9v9.5h-15z" fill="#e8c650" stroke="#806000" />
    {open && <path d="M2.5 6.5h13l-2 7h-13z" fill="#fff2a8" stroke="#806000" />}
  </svg>
)

export const FileIcon = () => (
  <svg width="14" height="16" viewBox="0 0 14 16" aria-hidden="true">
    <path d="M1.5 0.5h8l3 3v12h-11z" fill="#fff" stroke="#000" />
    <path d="M3.5 6.5h7M3.5 9h7M3.5 11.5h5" stroke="#000080" />
  </svg>
)

export const LockIcon = () => (
  <svg width="11" height="13" viewBox="0 0 11 13" aria-label="locked">
    <path d="M2.5 6V4a3 3 0 0 1 6 0v2" fill="none" stroke="#404040" strokeWidth="1.5" />
    <rect x="1" y="6" width="9" height="6.5" fill="#d0a000" stroke="#604000" />
  </svg>
)

export const BinIcon = ({ full }: { full: boolean }) => (
  <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
    <path d="M7 9h18l-2 21H9z" fill="#c0c0c0" stroke="#000" />
    <path d="M12 12v15M16 12v15M20 12v15" stroke="#606060" />
    {full && <path d="M9 9l3-6 4 3 3-4 4 7z" fill="#fff" stroke="#000" />}
    <rect x="5" y="7" width="22" height="3" fill="#e0e0e0" stroke="#000" />
  </svg>
)

export const DriveIcon = () => (
  <svg width="32" height="20" viewBox="0 0 32 20" aria-hidden="true">
    <rect x="1" y="4" width="30" height="13" fill="#c0c0c0" stroke="#000" />
    <rect x="1" y="4" width="30" height="3" fill="#fff" />
    <rect x="24" y="11" width="4" height="2" fill="#00c000" />
  </svg>
)
