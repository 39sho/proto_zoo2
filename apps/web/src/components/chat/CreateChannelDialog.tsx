import { useState, type FormEvent } from 'react'

import type { ChannelVisibility } from '../../lib/types'
import { reportError } from '../../lib/toast'
import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Input } from '../ui/input'
import { Label } from '../ui/label'
import { Switch } from '../ui/switch'

export function CreateChannelDialog({
  open,
  onOpenChange,
  onCreate,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreate: (name: string, visibility: ChannelVisibility) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [isPrivate, setIsPrivate] = useState(false)
  const [busy, setBusy] = useState(false)

  function close() {
    setName('')
    setIsPrivate(false)
    onOpenChange(false)
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || busy) return
    setBusy(true)
    try {
      await onCreate(trimmed, isPrivate ? 'private' : 'public')
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
          <DialogTitle>Create a channel</DialogTitle>
          <DialogDescription>Channels are where conversations happen.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="channel-name">Name</Label>
            <Input
              id="channel-name"
              autoFocus
              value={name}
              placeholder="new-channel"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <Label htmlFor="channel-private">Private channel</Label>
              <span className="text-xs text-muted-foreground">
                Only invited members can access it.
              </span>
            </div>
            <Switch id="channel-private" checked={isPrivate} onCheckedChange={setIsPrivate} />
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
