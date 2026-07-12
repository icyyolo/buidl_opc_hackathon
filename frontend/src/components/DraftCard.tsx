import { useState } from 'react'
import type { Draft } from '../types'

interface DraftCardProps {
  draft: Draft
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()

  const copied = document.execCommand('copy')
  document.body.removeChild(textarea)
  if (!copied) throw new Error('Clipboard unavailable')
}

export function DraftCard({ draft }: DraftCardProps) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const clipboardText = `Subject: ${draft.subject}\n\n${draft.body}`

  async function handleCopy() {
    try {
      await copyText(clipboardText)
      setCopyState('copied')
    } catch {
      setCopyState('failed')
    }
  }

  return (
    <aside className="draft-card" aria-label={`Prepared message: ${draft.subject}`}>
      <div className="draft-heading">
        <div>
          <p className="eyebrow">Ready to send</p>
          <h4>{draft.subject}</h4>
        </div>
        <button
          className="copy-button"
          type="button"
          onClick={handleCopy}
          aria-label={`Copy draft: ${draft.subject}`}
        >
          {copyState === 'copied' ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>{draft.body}</pre>
      {copyState !== 'idle' && (
        <p className={`copy-status ${copyState}`} role="status" aria-live="polite">
          {copyState === 'copied' && 'Subject and message copied.'}
          {copyState === 'failed' && 'Copy failed — select the message above.'}
        </p>
      )}
    </aside>
  )
}
