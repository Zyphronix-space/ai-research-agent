import ReactMarkdown from 'react-markdown'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import { GlassButton, GlassSourceCard, useToast } from './glass'
import { BookmarkIcon, CopyIcon, DownloadIcon, PlusIcon, RefreshIcon } from './icons'

function deriveExecutiveSummary(run) {
  if (run.key_findings?.length > 0) return run.key_findings.slice(0, 2).join(' ')
  const text = (run.final_answer || '').replace(/^#.*$/m, '').trim()
  return text.length > 260 ? `${text.slice(0, 260)}…` : text
}

function collectLimitations(run) {
  const limitations = []
  if (run.review) {
    if (run.review.missing_topics?.length) limitations.push(...run.review.missing_topics.map((t) => `Gap: ${t}`))
    if (run.review.contradictions?.length) limitations.push(...run.review.contradictions.map((c) => `Contradiction: ${c}`))
    if (run.review.unsupported_claims?.length) limitations.push(...run.review.unsupported_claims.map((c) => `Unsupported claim: ${c}`))
  }
  for (const entry of run.trace || []) {
    for (const l of entry.finding?.limitations || []) limitations.push(l)
  }
  return [...new Set(limitations)]
}

export function ReportView({ run, sources, onToggleSaved, onRegenerate, onFollowUp, regenerating }) {
  const navigate = useNavigate()
  const { pushToast } = useToast()
  const [copied, setCopied] = useState(false)
  const limitations = collectLimitations(run)

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(run.final_answer || '')
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      pushToast({ type: 'error', message: 'Could not copy to clipboard - your browser may have blocked it.' })
    }
  }

  const followUp = () => {
    if (onFollowUp) onFollowUp()
    else navigate(`/research/new?project_id=${run.project_id || ''}`)
  }

  return (
    <div className="print-area" style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ margin: 0 }}>{run.title || run.question}</h1>
        <div className="no-print" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {onToggleSaved && (
            <GlassButton size="sm" onClick={() => onToggleSaved(!run.saved)}>
              <BookmarkIcon size={14} filled={run.saved} /> {run.saved ? 'Saved' : 'Save'}
            </GlassButton>
          )}
          <GlassButton size="sm" onClick={() => window.print()}>
            <DownloadIcon size={14} /> Export PDF
          </GlassButton>
          <GlassButton size="sm" onClick={copyReport}>
            <CopyIcon size={14} /> {copied ? 'Copied!' : 'Copy'}
          </GlassButton>
          {onRegenerate && (
            <GlassButton size="sm" onClick={onRegenerate} loading={regenerating}>
              <RefreshIcon size={14} /> Regenerate
            </GlassButton>
          )}
          <GlassButton size="sm" variant="primary" onClick={followUp}>
            <PlusIcon size={14} /> Follow-up research
          </GlassButton>
        </div>
      </div>

      <section>
        <h2>Executive Summary</h2>
        <p>{deriveExecutiveSummary(run) || 'No summary available.'}</p>
      </section>

      {run.key_findings?.length > 0 && (
        <section>
          <h2>Key Findings</h2>
          <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {run.key_findings.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>Detailed Analysis</h2>
        <div style={{ fontSize: '0.92rem', lineHeight: 1.65 }}>
          <ReactMarkdown>{run.final_answer || '_No report generated yet._'}</ReactMarkdown>
        </div>
      </section>

      {limitations.length > 0 && (
        <section>
          <h2>Limitations</h2>
          <ul style={{ paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 4, color: 'var(--text-dim)' }}>
            {limitations.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2>Sources</h2>
        {sources && sources.length > 0 ? (
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            {sources.map((s) => (
              <GlassSourceCard key={s.id ?? s.url} source={s} onOpen={(src) => window.open(src.url, '_blank', 'noreferrer')} />
            ))}
          </div>
        ) : (
          <p style={{ color: 'var(--text-dim)' }}>No sources recorded for this report.</p>
        )}
      </section>
    </div>
  )
}
