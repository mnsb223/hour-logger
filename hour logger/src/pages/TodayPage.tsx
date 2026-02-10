// src/pages/TodayPage.tsx
import { useEffect, useMemo, useState } from 'react'

const LS_ACTIVE_SESSION_KEY = 'timeclock.activeSession.v1'
const LS_SHIFTS_KEY = 'timeclock.shifts.v1'
const LS_PUNCHES_KEY = 'timeclock.punches.v1'

type PunchType = 'CLOCK_IN' | 'CLOCK_OUT' | 'BREAK_START' | 'BREAK_END' | 'EDIT'

type Punch = {
  id: string
  shiftId: string
  type: PunchType
  at: number
  source: 'AUTO' | 'MANUAL'
  comment?: string
}

type Shift = {
  id: string
  startAt: number
  endAt: number
  breakSeconds: number
}

type ActiveSession = {
  shiftId: string
  startAt: number
  breakSeconds: number
  breakStartedAt: number | null
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function isSameLocalDay(a: number, b: number): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  )
}

function shiftSeconds(s: Shift): number {
  return Math.max(0, Math.floor((s.endAt - s.startAt) / 1000) - (s.breakSeconds ?? 0))
}

function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const hh = String(h).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  const ss = String(sec).padStart(2, '0')
  return `${hh}:${mm}:${ss}`
}

function toHHMM(ts: number): string {
  const d = new Date(ts)
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function withTimeOnSameDay(dayTs: number, hhmm: string): number {
  const [hh, mm] = hhmm.split(':').map(Number)
  const d = new Date(dayTs)
  d.setHours(hh ?? 0, mm ?? 0, 0, 0)
  return d.getTime()
}

function loadShifts(): Shift[] {
  const raw = localStorage.getItem(LS_SHIFTS_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Shift[]) : []
  } catch {
    return []
  }
}

function saveShifts(shifts: Shift[]) {
  localStorage.setItem(LS_SHIFTS_KEY, JSON.stringify(shifts))
}

function loadPunches(): Punch[] {
  const raw = localStorage.getItem(LS_PUNCHES_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as Punch[]) : []
  } catch {
    return []
  }
}

function savePunches(punches: Punch[]) {
  localStorage.setItem(LS_PUNCHES_KEY, JSON.stringify(punches))
}

function loadActiveSession(): ActiveSession | null {
  const raw = localStorage.getItem(LS_ACTIVE_SESSION_KEY)
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as ActiveSession
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.shiftId !== 'string') return null
    if (typeof parsed.startAt !== 'number') return null
    if (typeof parsed.breakSeconds !== 'number') return null
    if (!(parsed.breakStartedAt === null || typeof parsed.breakStartedAt === 'number')) return null
    return parsed
  } catch {
    return null
  }
}

function saveActiveSession(value: ActiveSession | null) {
  if (value == null) localStorage.removeItem(LS_ACTIVE_SESSION_KEY)
  else localStorage.setItem(LS_ACTIVE_SESSION_KEY, JSON.stringify(value))
}

export default function TodayPage() {
  const [now, setNow] = useState(() => Date.now())

  const [activeSession, setActiveSession] = useState<ActiveSession | null>(() => loadActiveSession())
  const [shifts, setShifts] = useState<Shift[]>(() => loadShifts())
  const [punches, setPunches] = useState<Punch[]>(() => loadPunches())

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editStart, setEditStart] = useState('')
  const [editEnd, setEditEnd] = useState('')
  const [editComment, setEditComment] = useState('')

  useEffect(() => saveActiveSession(activeSession), [activeSession])
  useEffect(() => saveShifts(shifts), [shifts])
  useEffect(() => savePunches(punches), [punches])

  function addPunch(p: Omit<Punch, 'id'>) {
    setPunches(prev => [{ id: makeId(), ...p }, ...prev])
  }

  useEffect(() => {
    if (!activeSession) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [activeSession])

  const elapsedSeconds = useMemo(() => {
    if (!activeSession) return 0
    const base = (now - activeSession.startAt) / 1000
    const accumulatedBreak = activeSession.breakSeconds
    const runningBreak = activeSession.breakStartedAt == null ? 0 : (now - activeSession.breakStartedAt) / 1000
    return base - accumulatedBreak - runningBreak
  }, [now, activeSession])

  function onClockIn() {
    const shiftId = makeId()
    const at = Date.now()

    setActiveSession({ shiftId, startAt: at, breakSeconds: 0, breakStartedAt: null })
    addPunch({ shiftId, type: 'CLOCK_IN', at, source: 'AUTO' })
  }

  function onClockOut() {
    if (!activeSession) return
    const at = Date.now()

    let breakSeconds = activeSession.breakSeconds
    if (activeSession.breakStartedAt != null) {
      breakSeconds += Math.max(0, Math.floor((at - activeSession.breakStartedAt) / 1000))
    }

    const newShift: Shift = { id: activeSession.shiftId, startAt: activeSession.startAt, endAt: at, breakSeconds }
    setShifts(prev => [newShift, ...prev])
    addPunch({ shiftId: activeSession.shiftId, type: 'CLOCK_OUT', at, source: 'AUTO' })

    setActiveSession(null)
  }

  function onStartBreak() {
    if (!activeSession) return
    if (activeSession.breakStartedAt != null) return
    const at = Date.now()
    setActiveSession({ ...activeSession, breakStartedAt: at })
    addPunch({ shiftId: activeSession.shiftId, type: 'BREAK_START', at, source: 'AUTO' })
  }

  function onEndBreak() {
    if (!activeSession) return
    const started = activeSession.breakStartedAt
    if (started == null) return

    const at = Date.now()
    const extra = Math.max(0, Math.floor((at - started) / 1000))

    setActiveSession({
      ...activeSession,
      breakSeconds: activeSession.breakSeconds + extra,
      breakStartedAt: null,
    })

    addPunch({ shiftId: activeSession.shiftId, type: 'BREAK_END', at, source: 'AUTO' })
  }

  const todayShifts = shifts.filter(s => isSameLocalDay(s.startAt, Date.now()))
  const todayTotalSeconds = todayShifts.reduce((sum, s) => sum + shiftSeconds(s), 0)

  return (
    <main className="tc-page">
      <div className="tc-container">
        <div className="aero-frame" aria-hidden="true" />
        <div className="aero-noise" aria-hidden="true" />

        <div className="aero-surface">
          <div className="aero-chrome">
            <div className="aero-chrome-left">
              <div className="aero-orb" aria-hidden="true" />
              <div className="aero-caption">Timeclock</div>
            </div>

            <div className="aero-chrome-right">
              <button className="aero-winbtn aero-min" type="button" aria-label="Minimize" />
              <button className="aero-winbtn aero-max" type="button" aria-label="Maximize" />
              <button className="aero-winbtn aero-close" type="button" aria-label="Close" />
            </div>
          </div>

          {activeSession == null ? (
            <button className="tc-btn tc-btn-primary" onClick={onClockIn}>
              Clock In
            </button>
          ) : (
            <>
              <div className="tc-row">
                <button className="tc-btn tc-btn-primary" onClick={onClockOut}>
                  Clock Out
                </button>

                {activeSession.breakStartedAt == null ? (
                  <button className="tc-btn" onClick={onStartBreak}>
                    Start Break
                  </button>
                ) : (
                  <button className="tc-btn" onClick={onEndBreak}>
                    End Break
                  </button>
                )}

                {activeSession.breakStartedAt != null && <span className="tc-badge">On break</span>}
              </div>

              <div className="tc-spacer" />

              <div className="tc-card">
                <div className="tc-subtle">
                  Clocked in since: {new Date(activeSession.startAt).toLocaleTimeString()}
                </div>
                <div className="tc-timer">{formatDuration(elapsedSeconds)}</div>
              </div>
            </>
          )}

          <div className="tc-spacer" />

          <div className="tc-card">
            <h2 className="tc-section-title">Today</h2>
            <div className="tc-total">Total: {formatDuration(todayTotalSeconds)}</div>

            {todayShifts.length === 0 ? (
              <div className="tc-note">No shifts yet.</div>
            ) : (
              <ul className="tc-list">
                {todayShifts.map(s => {
                  const shiftPunches = punches.filter(p => p.shiftId === s.id)
                  const hasManual = shiftPunches.some(p => p.source === 'MANUAL')
                  const lastEdit = shiftPunches.find(p => p.type === 'EDIT' && p.comment)

                  return (
                    <li key={s.id} className="tc-item">
                      <div className="tc-item-top">
                        <div className="tc-item-main">
                          <span>
                            {new Date(s.startAt).toLocaleTimeString()} – {new Date(s.endAt).toLocaleTimeString()}
                            {' • '}
                            {formatDuration(shiftSeconds(s))}
                          </span>
                          {hasManual && <span className="tc-badge">MANUAL</span>}
                        </div>

                        <div className="tc-row">
                          <button
                            className="tc-btn"
                            onClick={() => {
                              setEditingId(s.id)
                              setEditStart(toHHMM(s.startAt))
                              setEditEnd(toHHMM(s.endAt))
                              setEditComment('')
                            }}
                          >
                            Edit
                          </button>

                          <button
                            className="tc-btn tc-btn-danger"
                            onClick={() => {
                              setShifts(prev => prev.filter(x => x.id !== s.id))
                              if (editingId === s.id) setEditingId(null)
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      {lastEdit?.comment && <div className="tc-note">Edit note: {lastEdit.comment}</div>}

                      {editingId === s.id && (
                        <div className="tc-edit-panel">
                          <div className="tc-row">
                            <div className="tc-field">
                              <div className="tc-label">Start</div>
                              <input
                                className="tc-input"
                                type="time"
                                value={editStart}
                                onChange={e => setEditStart(e.target.value)}
                              />
                            </div>

                            <div className="tc-field">
                              <div className="tc-label">End</div>
                              <input
                                className="tc-input"
                                type="time"
                                value={editEnd}
                                onChange={e => setEditEnd(e.target.value)}
                              />
                            </div>

                            <div className="tc-field" style={{ minWidth: 240 }}>
                              <div className="tc-label">Comment (required)</div>
                              <input
                                className="tc-input"
                                value={editComment}
                                onChange={e => setEditComment(e.target.value)}
                                placeholder="Why was this edited?"
                              />
                            </div>
                          </div>

                          <div className="tc-spacer" />

                          <div className="tc-row">
                            <button
                              className="tc-btn tc-btn-primary"
                              onClick={() => {
                                const comment = editComment.trim()
                                if (!comment) {
                                  alert('Please add a comment for manual edits.')
                                  return
                                }

                                const dayTs = s.startAt
                                const newStart = withTimeOnSameDay(dayTs, editStart)
                                let newEnd = withTimeOnSameDay(dayTs, editEnd)
                                if (newEnd < newStart) newEnd += 24 * 60 * 60 * 1000

                                setShifts(prev =>
                                  prev.map(x => (x.id === s.id ? { ...x, startAt: newStart, endAt: newEnd } : x))
                                )

                                addPunch({
                                  shiftId: s.id,
                                  type: 'EDIT',
                                  at: Date.now(),
                                  source: 'MANUAL',
                                  comment,
                                })

                                setEditingId(null)
                              }}
                            >
                              Save
                            </button>

                            <button className="tc-btn" onClick={() => setEditingId(null)}>
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
