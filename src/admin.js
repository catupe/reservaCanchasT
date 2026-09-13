import './style.css'
import {
  adminLogin,
  fetchAllCourts,
  createCourt,
  updateCourt,
  deleteCourt,
  fetchReservationsForAdmin,
  cancelReservationAsAdmin,
} from './lib/api.js'
import { formatTime, toDateInputValue, getToday } from './lib/dateUtils.js'

// --- Sesión simple (front-only). Ver sql/schema.sql -> PENDIENTE PARA ENDURECER ---
const SESSION_KEY = 'admin_session'

function saveSession(admin) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(admin))
}
function getSession() {
  const raw = localStorage.getItem(SESSION_KEY)
  return raw ? JSON.parse(raw) : null
}
function clearSession() {
  localStorage.removeItem(SESSION_KEY)
}

// --- Elementos ---
const loginView = document.getElementById('login-view')
const panelView = document.getElementById('panel-view')
const loginForm = document.getElementById('login-form')
const loginMessage = document.getElementById('login-message')
const adminWelcome = document.getElementById('admin-welcome')
const logoutBtn = document.getElementById('logout-btn')

const courtForm = document.getElementById('court-form')
const courtIdInput = document.getElementById('court-id')
const courtNameInput = document.getElementById('court-name')
const courtOpenInput = document.getElementById('court-open')
const courtCloseInput = document.getElementById('court-close')
const courtActiveInput = document.getElementById('court-active')
const courtCancelEditBtn = document.getElementById('court-cancel-edit')
const courtsTableBody = document.querySelector('#courts-table tbody')

const reservationsTableBody = document.querySelector('#reservations-table tbody')
const adminDateFilter = document.getElementById('admin-date-filter')

function setMessage(el, text, type) {
  el.textContent = text
  el.className = 'message' + (type ? ` ${type}` : '')
}

function showPanel(admin) {
  loginView.classList.add('hidden')
  panelView.classList.remove('hidden')
  adminWelcome.textContent = `Conectado como ${admin.username}`
  loadCourts()
  adminDateFilter.value = toDateInputValue(getToday())
  loadReservations()
}

function showLogin() {
  panelView.classList.add('hidden')
  loginView.classList.remove('hidden')
}

// --- Login ---
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  setMessage(loginMessage, '', '')
  const username = document.getElementById('admin-username').value.trim()
  const password = document.getElementById('admin-password').value

  try {
    const admin = await adminLogin(username, password)
    saveSession(admin)
    showPanel(admin)
  } catch (err) {
    setMessage(loginMessage, err.message || 'Error al iniciar sesión.', 'error')
  }
})

logoutBtn.addEventListener('click', () => {
  clearSession()
  showLogin()
})

// --- Canchas ---
async function loadCourts() {
  try {
    const courts = await fetchAllCourts()
    renderCourts(courts)
  } catch (err) {
    console.error(err)
  }
}

function renderCourts(courts) {
  courtsTableBody.innerHTML = ''
  for (const c of courts) {
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td>${c.name}</td>
      <td>${formatTime(c.open_time)} a ${formatTime(c.close_time)}</td>
      <td>${c.is_active ? 'Activa' : 'Inactiva'}</td>
      <td>
        <button class="secondary edit-court" data-id="${c.id}">Editar</button>
        <button class="secondary delete-court" data-id="${c.id}">Eliminar</button>
      </td>
    `
    courtsTableBody.appendChild(tr)
    tr.querySelector('.edit-court').addEventListener('click', () => startEditCourt(c))
    tr.querySelector('.delete-court').addEventListener('click', () => handleDeleteCourt(c.id))
  }
}

function startEditCourt(court) {
  courtIdInput.value = court.id
  courtNameInput.value = court.name
  courtOpenInput.value = court.open_time.slice(0, 5)
  courtCloseInput.value = court.close_time.slice(0, 5)
  courtActiveInput.checked = court.is_active
  courtCancelEditBtn.classList.remove('hidden')
}

function resetCourtForm() {
  courtForm.reset()
  courtIdInput.value = ''
  courtActiveInput.checked = true
  courtCancelEditBtn.classList.add('hidden')
}

courtCancelEditBtn.addEventListener('click', resetCourtForm)

courtForm.addEventListener('submit', async (e) => {
  e.preventDefault()
  const id = courtIdInput.value
  const payload = {
    name: courtNameInput.value.trim(),
    open_time: courtOpenInput.value,
    close_time: courtCloseInput.value,
    is_active: courtActiveInput.checked,
  }

  if (payload.open_time >= payload.close_time) {
    alert('El horario "desde" debe ser anterior al horario "hasta".')
    return
  }

  try {
    if (id) {
      await updateCourt(id, payload)
    } else {
      await createCourt({
        name: payload.name,
        openTime: payload.open_time,
        closeTime: payload.close_time,
      })
    }
    resetCourtForm()
    await loadCourts()
  } catch (err) {
    alert(err.message || 'No se pudo guardar la cancha.')
  }
})

async function handleDeleteCourt(id) {
  if (!confirm('¿Eliminar esta cancha? También se perderán sus reservas asociadas.')) return
  try {
    await deleteCourt(id)
    await loadCourts()
  } catch (err) {
    alert(err.message || 'No se pudo eliminar la cancha.')
  }
}

// --- Reservas ---
async function loadReservations() {
  const dateStr = adminDateFilter.value
  if (!dateStr) return
  try {
    const reservations = await fetchReservationsForAdmin(dateStr)
    renderReservations(reservations)
  } catch (err) {
    console.error(err)
  }
}

function renderReservations(reservations) {
  reservationsTableBody.innerHTML = ''
  if (reservations.length === 0) {
    reservationsTableBody.innerHTML = '<tr><td colspan="5">Sin reservas para este día.</td></tr>'
    return
  }
  for (const r of reservations) {
    const tr = document.createElement('tr')
    const statusClass = r.status === 'confirmed' ? 'status-confirmed' : 'status-cancelled'
    const statusLabel = r.status === 'confirmed' ? 'Confirmada' : 'Cancelada'
    tr.innerHTML = `
      <td>${r.courts?.name || ''}</td>
      <td>${formatTime(r.start_time)} a ${formatTime(r.end_time)}</td>
      <td>${r.cedula}</td>
      <td><span class="status-badge ${statusClass}">${statusLabel}</span></td>
      <td>${r.status === 'confirmed' ? `<button class="secondary cancel-res" data-id="${r.id}">Cancelar</button>` : ''}</td>
    `
    reservationsTableBody.appendChild(tr)
    const cancelBtn = tr.querySelector('.cancel-res')
    if (cancelBtn) {
      cancelBtn.addEventListener('click', async () => {
        if (!confirm('¿Cancelar esta reserva?')) return
        try {
          await cancelReservationAsAdmin(r.id)
          await loadReservations()
        } catch (err) {
          alert(err.message || 'No se pudo cancelar.')
        }
      })
    }
  }
}

adminDateFilter.addEventListener('change', loadReservations)

// --- Arranque ---
const existingSession = getSession()
if (existingSession) {
  showPanel(existingSession)
} else {
  showLogin()
}
