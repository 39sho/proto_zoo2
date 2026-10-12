import { toast } from 'sonner'

export function reportError(error: unknown) {
  toast.error(error instanceof Error ? error.message : String(error))
}

type Persistable = { isPersisted: { promise: Promise<unknown> } }

/** Surface a failed optimistic write (TanStack DB rolls it back automatically). */
export function trackTransaction(transaction: Persistable) {
  transaction.isPersisted.promise.catch(reportError)
}
