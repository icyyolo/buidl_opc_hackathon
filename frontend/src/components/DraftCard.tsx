import { useEffect, useRef, useState } from 'react'
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
  const [showCopiedConfirmation, setShowCopiedConfirmation] = useState(false)
  const [announcementRevision, setAnnouncementRevision] = useState(0)
  const confirmationTimerRef = useRef<number | null>(null)
  const copyAttemptRef = useRef(0)
  const clipboardText = `Subject: ${draft.subject}\n\n${draft.body}`

  useEffect(() => {
    return () => {
      if (confirmationTimerRef.current !== null) {
        window.clearTimeout(confirmationTimerRef.current)
      }
    }
  }, [])

  async function handleCopy() {
    const attempt = copyAttemptRef.current + 1
    copyAttemptRef.current = attempt

    try {
      await copyText(clipboardText)
      if (attempt !== copyAttemptRef.current) return

      setCopyState('copied')
      setAnnouncementRevision((revision) => revision + 1)
      setShowCopiedConfirmation(true)
      if (confirmationTimerRef.current !== null) {
        window.clearTimeout(confirmationTimerRef.current)
      }
      confirmationTimerRef.current = window.setTimeout(() => {
        setShowCopiedConfirmation(false)
        confirmationTimerRef.current = null
      }, 1500)
    } catch {
      if (attempt !== copyAttemptRef.current) return

      if (confirmationTimerRef.current !== null) {
        window.clearTimeout(confirmationTimerRef.current)
        confirmationTimerRef.current = null
      }
      setCopyState('failed')
      setAnnouncementRevision((revision) => revision + 1)
      setShowCopiedConfirmation(false)
    }
  }

  return (
    <aside className="draft-card" aria-label={`Prepared message: ${draft.subject}`}>
      <div className="draft-heading">
        <div>
          <p className="eyebrow">Ready to review</p>
          <h4>{draft.subject}</h4>
        </div>
        <button
          className="copy-button"
          type="button"
          onClick={handleCopy}
          aria-label={`Copy draft: ${draft.subject}`}
        >
          {showCopiedConfirmation ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      <pre>{draft.body}</pre>
      {copyState !== 'idle' && (
        <p
          className={`copy-status ${copyState}`}
          key={announcementRevision}
          role="status"
          aria-live="polite"
        >
          {copyState === 'copied' && 'Subject and message copied.'}
          {copyState === 'failed' && 'Copy failed — select the message above.'}
        </p>
      )}
    </aside>
  )
}
