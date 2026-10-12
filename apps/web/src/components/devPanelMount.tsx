import { createRoot } from 'react-dom/client'

import { DevPanel } from './DevPanel'

let mounted = false

/**
 * Mount the shape inspector in its own React root, outside the app tree. Keeping
 * it out of the router/reconciliation means it can't perturb the sync layer.
 */
export function mountDevPanel() {
  if (mounted || typeof document === 'undefined' || !import.meta.env.DEV) return
  mounted = true
  const container = document.createElement('div')
  container.id = 'dev-panel-root'
  document.body.appendChild(container)
  createRoot(container).render(<DevPanel />)
}
