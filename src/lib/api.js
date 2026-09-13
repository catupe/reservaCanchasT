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

export async function fetchConfirmedReservationsForDate(dateStr) {
  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('reservation_date', dateStr)
    .eq('status', 'confirmed')
  if (error) throw error
  return data
}

function isValidCedula(cedula) {
  return /^\d{6,8}$/.test(cedula)
}

// Crea una reserva. Antes de insertar, re-valida en el cliente las mismas
// reglas de negocio (día habilitado, cédula, cupo). La integridad final la
// garantizan los índices únicos de la base (uniq_court_slot, uniq_cedula_per_day).
export async function createReservation({ courtId, cedula, dateStr, startTime, endTime }) {
  if (!isValidCedula(cedula)) {
    throw new Error('La cédula ingresada no es válida (solo números, 6 a 8 dígitos).')
  }

  const { data, error } = await supabase
    .from('reservations')
    .insert({
      court_id: courtId,
      cedula,
      reservation_date: dateStr,
      start_time: startTime,
      end_time: endTime,
      status: 'confirmed',
    })
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      // violación de índice único: distinguir cuál fue
      if (error.message.includes('uniq_cedula_per_day')) {
        throw new Error('Esa cédula ya tiene una reserva para ese día.')
      }
      throw new Error('Ese horario ya fue reservado por otra persona. Elegí otro.')
    }
    throw error
  }
  return data
}

// Cancelación por el propio cliente: debe indicar la cédula con la que reservó.
export async function cancelReservationByCedula({ reservationId, cedula }) {
  const { data, error } = await supabase
    .from('reservations')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', reservationId)
    .eq('cedula', cedula)
    .eq('status', 'confirmed')
    .select()
    .single()
  if (error) throw error
  if (!data) throw new Error('No se encontró una reserva activa con esa cédula.')
  return data
}

export async function fetchReservationsByCedula(cedula) {
  const { data, error } = await supabase
    .from('reservations')
    .select('*, courts(name)')
    .eq('cedula', cedula)
    .eq('status', 'confirmed')
    .order('reservation_date', { ascending: true })
  if (error) throw error
  return data
}

// ---------- Admin ----------
// Nota: el login propio (admin_login) valida usuario/contraseña vía RPC,
// y la sesión en el front queda guardada en memoria/localStorage. Ver
// sql/schema.sql, sección "PENDIENTE PARA ENDURECER".

export async function adminLogin(username, password) {
  const { data, error } = await supabase.rpc('admin_login', {
    p_username: username,
    p_password: password,
  })
  if (error) throw error
  if (!data || data.length === 0) {
    throw new Error('Usuario o contraseña incorrectos.')
  }
  return data[0] // { id, username }
}

export async function fetchAllCourts() {
  const { data, error } = await supabase.from('courts').select('*').order('name')
  if (error) throw error
  return data
}

export async function createCourt({ name, openTime, closeTime }) {
  const { data, error } = await supabase
    .from('courts')
    .insert({ name, open_time: openTime, close_time: closeTime, is_active: true })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateCourt(id, fields) {
  const { data, error } = await supabase.from('courts').update(fields).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteCourt(id) {
  const { error } = await supabase.from('courts').delete().eq('id', id)
  if (error) throw error
}

export async function fetchReservationsForAdmin(dateStr) {
  const { data, error } = await supabase
    .from('reservations')
    .select('*, courts(name)')
    .eq('reservation_date', dateStr)
    .order('start_time', { ascending: true })
  if (error) throw error
  return data
}

export async function cancelReservationAsAdmin(reservationId) {
  const { data, error } = await supabase
    .from('reservations')
    .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
    .eq('id', reservationId)
    .select()
    .single()
  if (error) throw error
  return data
}

export async function fetchAppSettings() {
  const { data, error } = await supabase.from('app_settings').select('*').single()
  if (error) throw error
  return data
}
