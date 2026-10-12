import { useState, type FormEvent } from 'react'

import { Button } from '../ui/button'
import { Input } from '../ui/input'

export function Composer({
  placeholder,
  onSend,
  autoFocus,
  testId = 'composer',
}: {
  placeholder: string
  onSend: (content: string) => void
  autoFocus?: boolean
  testId?: string
}) {
  const [text, setText] = useState('')

  function submit(event: FormEvent) {
    event.preventDefault()
    const content = text.trim()
    if (!content) return
    setText('')
    onSend(content)
  }

  return (
    <form onSubmit={submit} className="px-4 pt-3 pb-5">
      <div className="flex gap-2">
        <Input
          value={text}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label={placeholder}
          data-testid={`${testId}-input`}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" data-testid={`${testId}-send`} disabled={!text.trim()}>
          Send
        </Button>
      </div>
    </form>
  )
}
