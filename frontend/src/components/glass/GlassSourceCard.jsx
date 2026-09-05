import { BookmarkIcon, LinkIcon, TrashIcon } from '../icons'

export function GlassSourceCard({ source, onOpen, onSave, onRemove }) {
  return (
    <div className="glass-source-card">
      <span className="glass-source-title">{source.title}</span>
      <div className="glass-source-meta">
        <span className="glass-source-domain">{source.domain}</span>
        <span>{source.published_at || 'Date unknown'}</span>
        <span className={`glass-relevance ${source.relevance}`}>{source.relevance}</span>
      </div>
      <div className="glass-source-actions">
        <button type="button" className="glass-btn sm" onClick={() => onOpen(source)}>
          <LinkIcon size={14} /> Open
        </button>
        {onSave && (
          <button type="button" className={`glass-btn sm ${source.saved ? 'primary' : ''}`} onClick={() => onSave(source)}>
            <BookmarkIcon size={14} filled={source.saved} /> {source.saved ? 'Saved' : 'Save'}
          </button>
        )}
        {onRemove && (
          <button type="button" className="glass-btn sm danger" onClick={() => onRemove(source)}>
            <TrashIcon size={14} /> Remove
          </button>
        )}
      </div>
    </div>
  )
}
