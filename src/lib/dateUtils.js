// Todas las fechas se manejan como YYYY-MM-DD (fecha local, sin hora)
// y las horas como "HH:00" en bloques de 1 hora.

export function toDateInputValue(date) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function getToday() {
  return new Date()
}

export function getTomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d
}

const WEEKDAYS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb']
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'set', 'oct', 'nov', 'dic']

// Únicas dos opciones válidas para reservar: hoy y mañana.
export function getBookableDates() {
  const today = getToday()
  const tomorrow = getTomorrow()
  return [
    { value: toDateInputValue(today), dayLabel: 'Hoy', dateLabel: formatDateLabel(today) },
    { value: toDateInputValue(tomorrow), dayLabel: 'Mañana', dateLabel: formatDateLabel(tomorrow) },
  ]
}

function formatDateLabel(date) {
  return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`
}

export function isDateBookable(dateStr) {
  const bookable = getBookableDates().map((d) => d.value)
  return bookable.includes(dateStr)
}

function timeToMinutes(t) {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minutesToTime(mins) {
  const h = String(Math.floor(mins / 60)).padStart(2, '0')
  const m = String(mins % 60).padStart(2, '0')
  return `${h}:${m}:00`
}

// Genera los bloques de 1 hora entre openTime y closeTime (formato "HH:MM:SS" o "HH:MM").
// Devuelve [{ start: "18:00:00", end: "19:00:00" }, ...]
export function generateHourSlots(openTime, closeTime) {
  const start = timeToMinutes(openTime)
  const end = timeToMinutes(closeTime)
  const slots = []
  for (let t = start; t + 60 <= end; t += 60) {
    slots.push({ start: minutesToTime(t), end: minutesToTime(t + 60) })
  }
  return slots
}

// Si la fecha elegida es hoy, descarta los horarios que ya pasaron (o están por empezar en <15min).
export function filterPastSlotsIfToday(slots, dateStr) {
  const today = toDateInputValue(getToday())
  if (dateStr !== today) return slots
  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  return slots.filter((slot) => timeToMinutes(slot.start) > nowMinutes)
}

export function formatTime(t) {
  return t.slice(0, 5)
}
