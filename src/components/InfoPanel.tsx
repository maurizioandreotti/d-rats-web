import type { ReactNode } from 'react'

interface InfoRow {
  label: string
  value: ReactNode
}

export function InfoPanel() {
  const rows: InfoRow[] = [
    { label: 'Author', value: 'Maurizio Andreotti' },
    { label: 'License', value: 'GPL-3.0-only' },
    { label: 'GitHub', value: <a href="https://github.com/maurizioandreotti/d-rats-web" target="_blank" rel="noopener noreferrer">github.com/maurizioandreotti/d-rats-web</a> },
  ]

  return (
    <div className="info-panel">
      {rows.map((row) => (
        <div key={row.label} className="info-row">
          <span className="info-label">{row.label}</span>
          <span className="info-value">{row.value}</span>
        </div>
      ))}
    </div>
  )
}