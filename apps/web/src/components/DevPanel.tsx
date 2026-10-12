import { useEffect, useState } from 'react'

import { inspectCollections, type CollectionInfo } from '../lib/collections'

/**
 * Dev-only overlay that lists the live Electric collections with their status
 * and row counts. Enabled only in development; toggle with the floating
 * "shapes" button. This is the quickest way to see whether a shape is ready,
 * still syncing or empty when something doesn't show up in the UI.
 */
export function DevPanel() {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<CollectionInfo[]>([])

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    const tick = () => setRows(inspectCollections())
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [open])

  if (!import.meta.env.DEV || !mounted) return null

  return (
    <div className="devpanel">
      <button
        className="devpanel-toggle"
        onClick={() => setOpen((v) => !v)}
        title="Inspect Electric collections"
      >
        shapes
      </button>
      {open && (
        <div className="devpanel-body">
          <div className="devpanel-head">Electric collections</div>
          <table>
            <thead>
              <tr>
                <th>id</th>
                <th>scope</th>
                <th>status</th>
                <th>ready</th>
                <th>rows</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    none yet
                  </td>
                </tr>
              )}
              {rows.map((collection) => (
                <tr key={collection.id}>
                  <td>{collection.id}</td>
                  <td>{collection.scope}</td>
                  <td>{collection.status}</td>
                  <td>{collection.ready ? 'yes' : 'no'}</td>
                  <td>{collection.rows}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="devpanel-hint">
            Client sync logs: <code>localStorage.debug = 'ts/db:electric'</code>
          </div>
        </div>
      )}
    </div>
  )
}
