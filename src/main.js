import './style.css'
import {
  fetchActiveCourts,
  fetchConfirmedReservationsForDate,
  createReservation,
  fetchReservationsByCedula,
  cancelReservationByCedula,
} from './lib/api.js'
import { getBookableDates, generateHourSlots, filterPastSlotsIfToday, formatTime } from './lib/dateUtils.js'

const COURT_ICON = `<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="12" cy="12" r="3"/><path d="M12 4v16M3 12h18"/></svg>`
const CHECK_ICON = `<svg viewBox="0 0 24 24"><path d="M4 12l5 5L20 6"/></svg>`

const dateOptionsEl = document.getElementById('date-options')
const courtOptionsEl = document.getElementById('court-options')
const courtsMetaEl = document.getElementById('courts-meta')
const slotsGridEl = document.getElementById('slots-grid')
const bookingForm = document.getElementById('booking-form')
const bookingSubmit = document.getElementById('booking-submit')
const bookingMessage = document.getElementById('booking-message')
const cedulaInput = document.getElementById('cedula')

const lookupForm = document.getElementById('lookup-form')
const lookupCedulaInput = document.getElementById('lookup-cedula')
const myReservationsDiv = document.getElementById('my-reservations')

let courts = []
let state = {
  dateStr: null,
  courtId: null,
  slot: null, // { start, end }
}

function setMessage(el, text, type) {
  el.textContent = text
  el.className = 'message' + (type ? ` ${type}` : '')
}

function updateSubmitState() {
  const ready = state.dateStr && state.courtId && state.slot
  bookingSubmit.disabled = !ready
  bookingSubmit.textContent = ready ? 'Reservar' : 'Elegí día, cancha y hora'
}

// ---------- Paso 1: fecha ----------
function renderDateOptions() {
  dateOptionsEl.innerHTML = ''
  const dates = getBookableDates()
  if (!state.dateStr) state.dateStr = dates[0].value

  for (const d of dates) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'option-card' + (state.dateStr === d.value ? ' selected' : '')
    btn.innerHTML = `
      <span class="option-label">${d.dayLabel}</span>
      <span class="option-value">${d.dateLabel}</span>
    `
    btn.addEventListener('click', () => {
      state.dateStr = d.value
      state.slot = null
      renderDateOptions()
      renderSlots()
      updateSubmitState()
    })
    dateOptionsEl.appendChild(btn)
  }
}

// ---------- Paso 2: cancha ----------
function renderCourtOptions() {
  courtOptionsEl.innerHTML = ''

  if (courts.length === 0) {
    courtOptionsEl.innerHTML = '<p class="slots-hint">No hay canchas disponibles por el momento.</p>'
    courtsMetaEl.textContent = ''
    return
  }

  courtsMetaEl.innerHTML = `<span class="dot dot-free"></span> ${courts.length} disponibles`

  if (!state.courtId) state.courtId = courts[0].id

  for (const c of courts) {
    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'court-card' + (state.courtId === c.id ? ' selected' : '')
    btn.innerHTML = `
      <span class="court-icon">${COURT_ICON}</span>
      <span>
        <span class="court-name">${c.name}</span>
        <span class="court-hours">${formatTime(c.open_time)} — ${formatTime(c.close_time)}</span>
      </span>
      <span class="court-check">${CHECK_ICON}</span>
    `
    btn.addEventListener('click', () => {
      state.courtId = c.id
      state.slot = null
      renderCourtOptions()
      renderSlots()
      updateSubmitState()
    })
    courtOptionsEl.appendChild(btn)
  }
}

// ---------- Paso 3: hora ----------
async function renderSlots() {
  if (!state.dateStr || !state.courtId) {
    slotsGridEl.innerHTML = '<p class="slots-hint">Elegí un día y una cancha para ver los horarios.</p>'
    return
  }

  const court = courts.find((c) => c.id === state.courtId)
  if (!court) return

  slotsGridEl.innerHTML = '<p class="slots-hint">Cargando horarios…</p>'

  try {
    const allSlots = generateHourSlots(court.open_time, court.close_time)
    const existingReservations = await fetchConfirmedReservationsForDate(state.dateStr)
    const takenStarts = new Set(
      existingReservations.filter((r) => r.court_id === state.courtId).map((r) => r.start_time)
    )
    const nonPastSlots = filterPastSlotsIfToday(allSlots, state.dateStr)
    const pastCount = allSlots.length - nonPastSlots.length

    slotsGridEl.innerHTML = ''

    if (allSlots.length === 0) {
      slotsGridEl.innerHTML = '<p class="slots-hint">Esta cancha no tiene horarios configurados.</p>'
      return
    }

    for (let i = 0; i < allSlots.length; i++) {
      const slot = allSlots[i]
      const isPast = i < pastCount
      const isTaken = takenStarts.has(slot.start)
      const isDisabled = isPast || isTaken
      const isSelected = state.slot && state.slot.start === slot.start

      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'slot-btn' + (isSelected ? ' selected' : '')
      btn.disabled = isDisabled
      btn.innerHTML = isTaken
        ? `${formatTime(slot.start)}<span class="slot-sub">Ocupada</span>`
        : isPast
        ? `${formatTime(slot.start)}<span class="slot-sub">Pasó</span>`
        : formatTime(slot.start)

      if (!isDisabled) {
        btn.addEventListener('click', () => {
          state.slot = slot
          renderSlots()
          updateSubmitState()
        })
      }
      slotsGridEl.appendChild(btn)
    }
  } catch (err) {
    console.error(err)
    slotsGridEl.innerHTML = '<p class="slots-hint">No se pudieron cargar los horarios. Intentá de nuevo.</p>'
  }
}

// ---------- Init ----------
async function init() {
  renderDateOptions()
  try {
    courts = await fetchActiveCourts()
  } catch (err) {
    console.error(err)
    courtsMetaEl.textContent = ''
    courtOptionsEl.innerHTML = '<p class="slots-hint">No se pudieron cargar las canchas. Intentá más tarde.</p>'
  }
  renderCourtOptions()
  await renderSlots()
  updateSubmitState()
}

// ---------- Paso 4: confirmar ----------
bookingForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  setMessage(bookingMessage, '', '')

  const cedula = cedulaInput.value.trim()
  if (!cedula || !state.dateStr || !state.courtId || !state.slot) {
    setMessage(bookingMessage, 'Completá todos los campos.', 'error')
    return
  }

  bookingSubmit.disabled = true

  try {
    await createReservation({
      courtId: state.courtId,
      cedula,
      dateStr: state.dateStr,
      startTime: state.slot.start,
    })
    setMessage(
      bookingMessage,
      `¡Reserva confirmada! ${formatTime(state.slot.start)} a ${formatTime(state.slot.end)}.`,
      'success'
    )
    bookingForm.reset()
    state.slot = null
    await renderSlots()
  } catch (err) {
    setMessage(bookingMessage, err.message || 'Ocurrió un error al reservar.', 'error')
  } finally {
    updateSubmitState()
  }
})

// ---------- Buscar / cancelar mi reserva ----------
lookupForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const cedula = lookupCedulaInput.value.trim()
  myReservationsDiv.innerHTML = ''
  if (!cedula) return

  try {
    const reservations = await fetchReservationsByCedula(cedula)
    if (reservations.length === 0) {
      myReservationsDiv.innerHTML = '<p class="message">No se encontraron reservas activas.</p>'
      return
    }
    for (const r of reservations) {
      const item = document.createElement('div')
      item.className = 'reservation-item'
      item.innerHTML = `
        <div>
          <strong>${r.courts?.name || 'Cancha'}</strong><br />
          ${r.reservation_date} · ${formatTime(r.start_time)} a ${formatTime(r.end_time)}
        </div>
        <button data-id="${r.id}" class="btn-secondary cancel-btn">Cancelar</button>
      `
      myReservationsDiv.appendChild(item)
    }

    myReservationsDiv.querySelectorAll('.cancel-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true
        try {
          await cancelReservationByCedula({ reservationId: btn.dataset.id, cedula })
          btn.closest('.reservation-item').remove()
          await renderSlots()
        } catch (err) {
          alert(err.message || 'No se pudo cancelar la reserva.')
          btn.disabled = false
        }
      })
    })
  } catch (err) {
    console.error(err)
    myReservationsDiv.innerHTML = '<p class="message error">Error al buscar reservas.</p>'
  }
})

init()
