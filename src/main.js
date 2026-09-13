import './style.css'
import {
  fetchActiveCourts,
  fetchConfirmedReservationsForDate,
  createReservation,
  fetchReservationsByCedula,
  cancelReservationByCedula,
} from './lib/api.js'
import { getBookableDates, generateHourSlots, filterPastSlotsIfToday, formatTime } from './lib/dateUtils.js'

const dateSelect = document.getElementById('date-select')
const courtSelect = document.getElementById('court-select')
const slotSelect = document.getElementById('slot-select')
const bookingForm = document.getElementById('booking-form')
const bookingMessage = document.getElementById('booking-message')
const cedulaInput = document.getElementById('cedula')

const lookupForm = document.getElementById('lookup-form')
const lookupCedulaInput = document.getElementById('lookup-cedula')
const myReservationsDiv = document.getElementById('my-reservations')

let courts = []

function setMessage(el, text, type) {
  el.textContent = text
  el.className = 'message' + (type ? ` ${type}` : '')
}

function populateDateSelect() {
  dateSelect.innerHTML = ''
  for (const d of getBookableDates()) {
    const opt = document.createElement('option')
    opt.value = d.value
    opt.textContent = d.label
    dateSelect.appendChild(opt)
  }
}

function populateCourtSelect() {
  courtSelect.innerHTML = ''
  if (courts.length === 0) {
    courtSelect.innerHTML = '<option value="">No hay canchas disponibles</option>'
    return
  }
  for (const c of courts) {
    const opt = document.createElement('option')
    opt.value = c.id
    opt.textContent = `${c.name} (${formatTime(c.open_time)} a ${formatTime(c.close_time)})`
    courtSelect.appendChild(opt)
  }
}

async function refreshSlots() {
  const courtId = courtSelect.value
  const dateStr = dateSelect.value
  slotSelect.innerHTML = ''
  slotSelect.disabled = true

  if (!courtId || !dateStr) {
    slotSelect.innerHTML = '<option value="">Elegí primero cancha y día</option>'
    return
  }

  const court = courts.find((c) => c.id === courtId)
  if (!court) return

  try {
    const [allSlots, existingReservations] = await Promise.all([
      Promise.resolve(generateHourSlots(court.open_time, court.close_time)),
      fetchConfirmedReservationsForDate(dateStr),
    ])

    const takenStarts = new Set(
      existingReservations.filter((r) => r.court_id === courtId).map((r) => r.start_time)
    )

    const availableSlots = filterPastSlotsIfToday(allSlots, dateStr).filter(
      (slot) => !takenStarts.has(slot.start)
    )

    if (availableSlots.length === 0) {
      slotSelect.innerHTML = '<option value="">Sin horarios disponibles</option>'
      return
    }

    slotSelect.innerHTML = ''
    for (const slot of availableSlots) {
      const opt = document.createElement('option')
      opt.value = JSON.stringify(slot)
      opt.textContent = `${formatTime(slot.start)} a ${formatTime(slot.end)}`
      slotSelect.appendChild(opt)
    }
    slotSelect.disabled = false
  } catch (err) {
    console.error(err)
    slotSelect.innerHTML = '<option value="">Error al cargar horarios</option>'
  }
}

async function init() {
  populateDateSelect()
  try {
    courts = await fetchActiveCourts()
  } catch (err) {
    console.error(err)
    setMessage(bookingMessage, 'No se pudieron cargar las canchas. Intentá más tarde.', 'error')
  }
  populateCourtSelect()
  await refreshSlots()
}

dateSelect.addEventListener('change', refreshSlots)
courtSelect.addEventListener('change', refreshSlots)

bookingForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  setMessage(bookingMessage, '', '')

  const cedula = cedulaInput.value.trim()
  const courtId = courtSelect.value
  const dateStr = dateSelect.value
  const slotRaw = slotSelect.value

  if (!cedula || !courtId || !dateStr || !slotRaw) {
    setMessage(bookingMessage, 'Completá todos los campos.', 'error')
    return
  }

  const slot = JSON.parse(slotRaw)
  const submitBtn = bookingForm.querySelector('button[type="submit"]')
  submitBtn.disabled = true

  try {
    await createReservation({
      courtId,
      cedula,
      dateStr,
      startTime: slot.start,
      endTime: slot.end,
    })
    setMessage(
      bookingMessage,
      `¡Reserva confirmada! ${formatTime(slot.start)} a ${formatTime(slot.end)}.`,
      'success'
    )
    bookingForm.reset()
    populateDateSelect()
    await refreshSlots()
  } catch (err) {
    setMessage(bookingMessage, err.message || 'Ocurrió un error al reservar.', 'error')
  } finally {
    submitBtn.disabled = false
  }
})

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
        <button data-id="${r.id}" class="secondary cancel-btn">Cancelar</button>
      `
      myReservationsDiv.appendChild(item)
    }

    myReservationsDiv.querySelectorAll('.cancel-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        btn.disabled = true
        try {
          await cancelReservationByCedula({ reservationId: btn.dataset.id, cedula })
          btn.closest('.reservation-item').remove()
          await refreshSlots()
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
