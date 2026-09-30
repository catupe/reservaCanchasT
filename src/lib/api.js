import { supabase } from './supabaseClient.js'

// ---------- Público ----------

export async function fetchActiveCourts() {
  const { data, error } = await supabase
    .from('courts')
    .select('*')
    .eq('is_active', true)
    .order('name', { ascending: true })
  if (error) throw error
  return data
}

// Lee la vista pública (sin cédulas) para calcular disponibilidad.
export async function fetchConfirmedReservationsForDate(dateStr) {
  const { data, error } = await supabase
    .from('public_court_slots')
    .select('*')
    .eq('reservation_date', dateStr)
  if (error) throw error
  return data
}

// Toda la validación de negocio (cédula, día hoy/mañana, horario de la
// cancha, ventana 6-22, cupo) se hace dentro de la función en la base.
export async function createReservation({ courtId, cedula, dateStr, startTime }) {
  const { data, error } = await supabase.rpc('create_reservation', {
    p_court_id: courtId,
    p_cedula: cedula,
    p_reservation_date: dateStr,
    p_start_time: startTime,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function cancelReservationByCedula({ reservationId, cedula }) {
  const { data, error } = await supabase.rpc('cancel_my_reservation', {
    p_reservation_id: reservationId,
    p_cedula: cedula,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function fetchReservationsByCedula(cedula) {
  const { data, error } = await supabase.rpc('get_my_reservations', { p_cedula: cedula })
  if (error) throw new Error(error.message)
  // Se normaliza para que main.js siga pudiendo usar r.courts.name
  return (data || []).map((r) => ({ ...r, courts: { name: r.court_name } }))
}

// ---------- Admin ----------
// Todas las acciones de escritura exigen el `token` de sesión devuelto
// por adminLogin, y se re-validan server-side en cada llamada (assert_admin).

export async function adminLogin(username, password) {
  const { data, error } = await supabase.rpc('admin_login', {
    p_username: username,
    p_password: password,
  })
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    throw new Error('Usuario o contraseña incorrectos.')
  }
  return data[0] // { id, username, token, expires_at }
}

export async function adminLogout(token) {
  const { error } = await supabase.rpc('admin_logout', { p_token: token })
  if (error) throw new Error(error.message)
}

export async function fetchAllCourts() {
  const { data, error } = await supabase.from('courts').select('*').order('name')
  if (error) throw error
  return data
}

export async function createCourt({ token, name, openTime, closeTime }) {
  const { data, error } = await supabase.rpc('admin_create_court', {
    p_token: token,
    p_name: name,
    p_open_time: openTime,
    p_close_time: closeTime,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function updateCourt(token, id, fields) {
  const { data, error } = await supabase.rpc('admin_update_court', {
    p_token: token,
    p_court_id: id,
    p_name: fields.name,
    p_open_time: fields.open_time,
    p_close_time: fields.close_time,
    p_is_active: fields.is_active,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function deleteCourt(token, id) {
  const { error } = await supabase.rpc('admin_delete_court', { p_token: token, p_court_id: id })
  if (error) throw new Error(error.message)
}

export async function fetchReservationsForAdmin(token, dateStr) {
  const { data, error } = await supabase.rpc('admin_list_reservations', {
    p_token: token,
    p_date: dateStr,
  })
  if (error) throw new Error(error.message)
  return (data || []).map((r) => ({ ...r, courts: { name: r.court_name } }))
}

export async function cancelReservationAsAdmin(token, reservationId) {
  const { data, error } = await supabase.rpc('admin_cancel_reservation', {
    p_token: token,
    p_reservation_id: reservationId,
  })
  if (error) throw new Error(error.message)
  return data
}
