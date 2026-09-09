import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { researchApi, sourcesApi, streamResearch, streamRestart } from '../lib/api'
import { applyPipelineEvent, initialPipelineState, pipelineRowsFromTrace } from '../components/pipelineReducer'
import { GlassActivityLog, GlassButton, GlassCard, GlassSkeleton, GlassTimeline, useToast } from '../components/glass'
import { ReportView } from '../components/ReportView'
import { RefreshIcon, StopIcon } from '../components/icons'

function deriveTitle(question) {
  const text = question.trim().replace(/\s+/g, ' ')
  return text.length > 60 ? `${text.slice(0, 60)}…` : text
}

export function LiveResearch() {
  const { id } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { pushToast } = useToast()

  const [run, setRun] = useState(null)
  const [pipeline, setPipeline] = useState(initialPipelineState)
  const [sources, setSources] = useState(null)
  const [streamError, setStreamError] = useState(null)
  const [sending, setSending] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [loadError, setLoadError] = useState(null)
  const controllerRef = useRef(null)

  const startPayload = location.state?.start
  const skipInitialLoad = location.state?.skipInitialLoad

  const loadSources = (runId) => {
    sourcesApi
      .list({ run_id: runId })
      .then(setSources)
      .catch(() => setSources([]))
  }

  const runStream = async (payload) => {
    setSending(true)
    setStreamError(null)
    setPipeline(initialPipelineState())
    setRun({
      id,
      question: payload.question,
      title: deriveTitle(payload.question),
      status: 'running',
      saved: false,
      project_id: payload.project_id,
      depth: payload.depth,
      final_answer: null,
      key_findings: null,
      review: null,
      trace: null,
    })

    const controller = new AbortController()
    controllerRef.current = controller
    let finalStatus = 'running'

    try {
      await streamResearch({ ...payload, run_id: id }, {
        signal: controller.signal,
        onEvent: (event) => {
          setPipeline((prev) => applyPipelineEvent(prev, event))
          if (event.type === 'writing_done') {
            setRun((prev) => ({ ...prev, final_answer: event.answer.answer_markdown, key_findings: event.answer.key_findings }))
          } else if (event.type === 'review_done') {
            setRun((prev) => ({ ...prev, review: event.review }))
          } else if (event.type === 'trace_summary') {
            finalStatus = 'done'
            setRun((prev) => ({ ...prev, status: 'done', trace: event.agents }))
          } else if (event.type === 'error') {
            finalStatus = 'error'
            setStreamError(event.message)
          }
        },
      })
    } catch (err) {
      if (err.name !== 'AbortError') {
        setStreamError(err.message)
        pushToast({ type: 'error', message: `Research run failed: ${err.message}` })
      }
      finalStatus = err.name === 'AbortError' ? 'cancelled' : 'error'
    } finally {
      setSending(false)
      controllerRef.current = null
      setRun((prev) => (prev ? { ...prev, status: finalStatus === 'cancelled' ? 'error' : prev.status } : prev))
      if (finalStatus === 'done') loadSources(id)
    }
  }

  const loadExistingRun = () => {
    setLoadError(null)
    setStreamError(null)
    setSources(null)
    researchApi
      .get(id)
      .then((detail) => {
        setRun(detail)
        setPipeline({ ...initialPipelineState(), rows: pipelineRowsFromTrace(detail.trace) })
        if (detail.status === 'done') loadSources(id)
      })
      .catch((err) => setLoadError(err.message))
  }

  useEffect(() => {
    if (startPayload) {
      runStream(startPayload)
    } else if (!skipInitialLoad) {
      loadExistingRun()
    }
    return () => controllerRef.current?.abort()
    // Deliberately keyed on `id` alone: a new id always means either a
    // fresh `start` payload or a run to load, and re-running per navigation
    // (rather than once ever) is what lets clicking between two research
    // runs without a full page reload work correctly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const cancel = () => controllerRef.current?.abort()

  const restart = async () => {
    setPipeline(initialPipelineState())
    setStreamError(null)
    setSending(true)
    const controller = new AbortController()
    controllerRef.current = controller
    let newId = null
    try {
      await streamRestart(id, {
        signal: controller.signal,
        onRunId: (rid) => {
          newId = rid
        },
        onEvent: (event) => setPipeline((prev) => applyPipelineEvent(prev, event)),
      })
      if (newId) {
        const detail = await researchApi.get(newId)
        setRun(detail)
        loadSources(newId)
        // Navigating only now (after the stream has already finished) means
        // the id-keyed effect's cleanup - which aborts controllerRef.current
        // on the way out - cancels an already-settled request, not this one.
        navigate(`/research/${newId}`, { replace: true, state: { skipInitialLoad: true } })
      }
    } catch (err) {
      if (err.name !== 'AbortError') pushToast({ type: 'error', message: `Restart failed: ${err.message}` })
    } finally {
      setSending(false)
      controllerRef.current = null
    }
  }

  const regenerateReport = async () => {
    setRegenerating(true)
    try {
      const updated = await researchApi.regenerateReport(id)
      setRun(updated)
      pushToast({ type: 'success', message: 'Report regenerated.' })
    } catch (err) {
      pushToast({ type: 'error', message: `Couldn't regenerate report: ${err.message}` })
    } finally {
      setRegenerating(false)
    }
  }

  const toggleSaved = async (saved) => {
    setRun((prev) => ({ ...prev, saved }))
    try {
      await researchApi.update(id, { saved })
    } catch (err) {
      setRun((prev) => ({ ...prev, saved: !saved }))
      pushToast({ type: 'error', message: `Couldn't update saved state: ${err.message}` })
    }
  }

  if (loadError) {
    return (
      <GlassCard>
        <p>Couldn't load this research run. {loadError}</p>
        <GlassButton onClick={loadExistingRun} style={{ marginTop: 10 }}>
          Retry
        </GlassButton>
      </GlassCard>
    )
  }

  if (!run) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <GlassSkeleton width={280} height={28} />
        <GlassSkeleton height={200} />
      </div>
    )
  }

  const isInterrupted = run.status === 'running' && !sending && !startPayload

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      <div className="no-print">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <h1 style={{ marginBottom: 4 }}>{run.title || run.question}</h1>
            <p style={{ color: 'var(--text-dim)' }}>{run.question}</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {sending && (
              <GlassButton variant="danger" onClick={cancel}>
                <StopIcon size={14} /> Cancel
              </GlassButton>
            )}
            {!sending && (run.status === 'done' || run.status === 'error' || isInterrupted) && (
              <GlassButton onClick={restart}>
                <RefreshIcon size={14} /> Restart research
              </GlassButton>
            )}
          </div>
        </div>

        {isInterrupted && (
          <GlassCard style={{ marginTop: 16, borderColor: 'var(--warn-bg)' }}>
            <p>This run was interrupted (the browser tab closed or the connection dropped) before it finished. Restart it to try again.</p>
          </GlassCard>
        )}

        {streamError && (
          <GlassCard style={{ marginTop: 16, borderColor: 'var(--danger-bg)' }}>
            <p style={{ color: 'var(--danger)' }}>{streamError}</p>
          </GlassCard>
        )}

        {pipeline.rows.length > 0 && (
          <div style={{ marginTop: 20, display: 'grid', gap: 20, gridTemplateColumns: sending || pipeline.activity.length > 0 ? '1.2fr 1fr' : '1fr' }}>
            <GlassTimeline rows={pipeline.rows} />
            {pipeline.activity.length > 0 && (
              <GlassCard>
                <div className="glass-card-title" style={{ marginBottom: 8 }}>
                  Activity
                </div>
                <GlassActivityLog entries={pipeline.activity} />
              </GlassCard>
            )}
          </div>
        )}
      </div>

      {run.final_answer && (
        <ReportView
          run={run}
          sources={sources}
          onToggleSaved={toggleSaved}
          onRegenerate={run.status === 'done' ? regenerateReport : undefined}
          regenerating={regenerating}
        />
      )}
    </div>
  )
}
