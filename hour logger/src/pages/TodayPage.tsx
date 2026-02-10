import { useEffect, useMemo, useState } from 'react'

const LS_ACTIVE_START_KEY = 'timeclock.activeStartAt'

const LS_SHIFTS_KEY = 'timeclock.shifts.v1'

type Shift = {
  id: string
  startAt: number
  endAt: number
  breakSeconds: number
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

function makeId(): string {
  // good enough for local app
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

function loadActiveStartAt(): number | null {
  const raw = localStorage.getItem(LS_ACTIVE_START_KEY)
  if (!raw) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

function saveActiveStartAt(value: number | null) {
  if (value == null) localStorage.removeItem(LS_ACTIVE_START_KEY)
  else localStorage.setItem(LS_ACTIVE_START_KEY, String(value))
}

export default function TodayPage() {
  const [activeStartAt, setActiveStartAt] = useState<number | null>(() => loadActiveStartAt())
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    saveActiveStartAt(activeStartAt)
  }, [activeStartAt])

  // tick only while clocked in
  useEffect(() => {
    if (activeStartAt == null) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [activeStartAt])

  const [shifts, setShifts] = useState<Shift[]>(() => loadShifts())

  useEffect(() => {
    saveShifts(shifts)
  }, [shifts])


  const elapsedSeconds = useMemo(() => {
    if (activeStartAt == null) return 0
    return (now - activeStartAt) / 1000
  }, [now, activeStartAt])

  function onClockIn() {
    setActiveStartAt(Date.now())
  }

    function onClockOut() {
    if (activeStartAt == null) return
    const endAt = Date.now()

    const newShift: Shift = {
        id: makeId(),
        startAt: activeStartAt,
        endAt,
        breakSeconds: 0,
    }

    setShifts(prev => [newShift, ...prev])
    setActiveStartAt(null)
    }

    const todayShifts = shifts.filter(s => isSameLocalDay(s.startAt, Date.now()))
    const todayTotalSeconds = todayShifts.reduce((sum, s) => sum + shiftSeconds(s), 0)

  return (
    <main style={{ padding: 16, maxWidth: 520, margin: '0 auto' }}>
      <h1 style={{ marginBottom: 8 }}>Timeclock</h1>

      {activeStartAt == null ? (
        <button onClick={onClockIn} style={{ fontSize: 18, padding: '12px 16px' }}>
          Clock In
        </button>
      ) : (
        <>
          <button onClick={onClockOut} style={{ fontSize: 18, padding: '12px 16px' }}>
            Clock Out
          </button>

          <div style={{ marginTop: 16 }}>
            <div>Clocked in since: {new Date(activeStartAt).toLocaleTimeString()}</div>
            <div style={{ fontSize: 28, marginTop: 6 }}>
              {formatDuration(elapsedSeconds)}
            </div>
          </div>
        </>
      )}

      <div style={{ marginTop: 20 }}>
        <h2 style={{ margin: '12px 0 8px' }}>Today</h2>
        <div style={{ fontSize: 18, marginBottom: 10 }}>
            Total: {formatDuration(todayTotalSeconds)}
        </div>

        {todayShifts.length === 0 ? (
            <div style={{ opacity: 0.7 }}>No shifts yet.</div>
        ) : (
            <ul style={{ paddingLeft: 18 }}>
            {todayShifts.map(s => (
                <li key={s.id} style={{ marginBottom: 6 }}>
                {new Date(s.startAt).toLocaleTimeString()} – {new Date(s.endAt).toLocaleTimeString()}
                {' • '}
                {formatDuration(shiftSeconds(s))}
                </li>
            ))}
            </ul>
        )}
        </div>
    </main>
  )
}
