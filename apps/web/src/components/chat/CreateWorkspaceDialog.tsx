import { useState, type FormEvent } from 'react'

import { reportError } from '../../lib/toast'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Input } from '../ui/input'
import { Label } from '../ui/label'

export function CreateWorkspaceDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (name: string) => Promise<unknown>
}) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  function close() {
    setName('')
    onOpenChange(false)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      await onCreate(trimmed)
      close()
    } catch (e) {
      reportError(e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create a workspace</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="workspace-name">Name</Label>
            <Input
              id="workspace-name"
              autoFocus
              value={name}
              placeholder="My workspace"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || busy}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
