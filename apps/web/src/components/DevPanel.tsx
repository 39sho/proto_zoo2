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

  const cell = 'max-w-[170px] truncate border-b border-border px-1.5 py-0.5 text-left'

  return (
    <div className="fixed bottom-3 left-3 z-[80] flex flex-col items-start gap-1.5 text-[0.72rem]">
      <button
        className="rounded-full border border-border bg-elevated px-2.5 py-1 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen((v) => !v)}
        title="Inspect Electric collections"
      >
        shapes
      </button>
      {open && (
        <div className="max-h-[40vh] w-[min(540px,90vw)] overflow-auto rounded-[10px] border border-border bg-sidebar p-2.5 shadow-2xl">
          <div className="mb-1.5 font-bold">Electric collections</div>
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${cell} font-semibold text-muted-foreground`}>id</th>
                <th className={`${cell} font-semibold text-muted-foreground`}>scope</th>
                <th className={`${cell} font-semibold text-muted-foreground`}>status</th>
                <th className={`${cell} font-semibold text-muted-foreground`}>ready</th>
                <th className={`${cell} font-semibold text-muted-foreground`}>rows</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className={`${cell} text-muted-foreground`}>
                    none yet
                  </td>
                </tr>
              )}
              {rows.map((collection) => (
                <tr key={collection.id}>
                  <td className={cell}>{collection.id}</td>
                  <td className={cell}>{collection.scope}</td>
                  <td className={cell}>{collection.status}</td>
                  <td className={cell}>{collection.ready ? 'yes' : 'no'}</td>
                  <td className={cell}>{collection.rows}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-1.5 text-muted-foreground">
            Client sync logs:{' '}
            <code className="rounded bg-field px-1">localStorage.debug = 'ts/db:electric'</code>
          </div>
        </div>
      )}
    </div>
  )
}
