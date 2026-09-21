import { randomUUID } from 'node:crypto'
import { httpError, isValidEmail, normalizeEmail, isCampusEmail, publicUser } from './auth.js'
import { UDP_BLOCKS, toMinutes } from './salas.js'

const SCHEDULE_KEY = 'app_schedule_v1'
const MAX_FRIENDS = 40

export function publicSchedule(raw) {
  if (!Array.isArray(raw)) return []
  return raw.map((block) => ({
    id: block.id,
    day: Number(block.day),
    startTime: String(block.startTime || ''),
    endTime: String(block.endTime || ''),
    subject: String(block.subject || block.courseName || ''),
    eventType: String(block.eventType || ''),
  })).filter((block) => block.day >= 1 && block.day <= 6 && block.startTime && block.endTime)
}

export function blockOverlaps(entry, udpBlock) {
  const start = toMinutes(entry.startTime)
  const end = toMinutes(entry.endTime)
  const bStart = toMinutes(udpBlock.start)
  const bEnd = toMinutes(udpBlock.end)
  return !(end <= bStart || start >= bEnd)
}

export function occupancyAtBlock(schedule, day, udpBlock) {
  return publicSchedule(schedule).filter((entry) => entry.day === Number(day) && blockOverlaps(entry, udpBlock))
}

export function currentFriendBlock(schedule, { day, minutes }) {
  const today = publicSchedule(schedule).filter((entry) => entry.day === day)
  const current = today.find((entry) => toMinutes(entry.startTime) <= minutes && minutes < toMinutes(entry.endTime))
  if (current) return { state: 'in_class', block: current }
  const next = today
    .filter((entry) => toMinutes(entry.startTime) > minutes)
    .sort((a, b) => toMinutes(a.startTime) - toMinutes(b.startTime))[0]
  if (next) return { state: 'free_until', block: next }
  return { state: 'free', block: null }
}

export function freeBlocksFor(people, { days = [1, 2, 3, 4, 5] } = {}) {
  const slots = []
  for (const day of days) {
    for (const udpBlock of UDP_BLOCKS) {
      const busy = people.map((person) => ({
        id: person.id,
        name: person.name,
        classes: occupancyAtBlock(person.schedule, day, udpBlock),
      }))
      const allFree = busy.every((row) => row.classes.length === 0)
      slots.push({
        day,
        block: udpBlock,
        free: allFree,
        people: busy,
      })
    }
  }
  return slots
}

const mapRow = (row, meId) => {
  const incoming = row.addressee_id === meId
  const friend = incoming
    ? { id: row.requester_id, email: row.requester_email, name: row.requester_name }
    : { id: row.addressee_id, email: row.addressee_email, name: row.addressee_name }
  return {
    id: row.id,
    status: row.status,
    createdAt: row.created_at,
    incoming,
    friend: publicUser({ id: friend.id, email: friend.email, name: friend.name, created_at: row.created_at }),
  }
}

const queuedRow = (row) => ({
  id: row.id,
  status: 'pending',
  queued: true,
  createdAt: row.created_at,
  incoming: false,
  friend: {
    id: null,
    email: row.email,
    name: String(row.email || '').split('@')[0] || row.email,
    createdAt: row.created_at,
  },
})

const FRIEND_SELECT = `
  SELECT f.id, f.requester_id, f.addressee_id, f.status, f.created_at,
         ru.email AS requester_email, ru.name AS requester_name,
         au.email AS addressee_email, au.name AS addressee_name
    FROM friendships f
    JOIN users ru ON ru.id = f.requester_id
    JOIN users au ON au.id = f.addressee_id
`

export function createFriendsService(db, { allowedEmailDomains, dataStore } = {}) {
  const readSchedule = async (userId) => {
    if (dataStore) {
      try { return publicSchedule(await dataStore.get(userId, SCHEDULE_KEY)) } catch { return [] }
    }
    const row = await db.get(
      'SELECT value FROM user_data WHERE user_id = $1 AND key = $2',
      [userId, SCHEDULE_KEY],
    )
    if (!row?.value) return []
    try { return publicSchedule(JSON.parse(row.value)) } catch { return [] }
  }

  const countActive = async (meId) => {
    const accepted = await db.all(
      `SELECT id FROM friendships WHERE status IN ('accepted', 'pending') AND (requester_id = $1 OR addressee_id = $2)`,
      [meId, meId],
    )
    const queued = await db.all(
      'SELECT id FROM friend_invites WHERE requester_id = $1',
      [meId],
    )
    return accepted.length + queued.length
  }

  return {
    async list(meId) {
      const rows = await db.all(
        `${FRIEND_SELECT} WHERE f.requester_id = $1 OR f.addressee_id = $2 ORDER BY f.created_at DESC`,
        [meId, meId],
      )
      const mapped = rows.map((row) => mapRow(row, meId))
      const queued = await db.all(
        'SELECT * FROM friend_invites WHERE requester_id = $1 ORDER BY created_at DESC',
        [meId],
      )
      return {
        friends: mapped.filter((row) => row.status === 'accepted'),
        incoming: mapped.filter((row) => row.status === 'pending' && row.incoming),
        outgoing: [
          ...mapped.filter((row) => row.status === 'pending' && !row.incoming),
          ...queued.map(queuedRow),
        ],
      }
    },

    async invite(meId, email) {
      const normalized = normalizeEmail(email)
      if (!isValidEmail(normalized)) throw httpError(400, 'Correo inválido')
      if (!isCampusEmail(normalized, allowedEmailDomains)) {
        throw httpError(403, 'Solo puedes agregar correos institucionales UDP')
      }
      const me = await db.get('SELECT * FROM users WHERE id = $1', [meId])
      if (me && normalizeEmail(me.email) === normalized) {
        throw httpError(400, 'No puedes agregarte a ti mismo')
      }

      const other = await db.get('SELECT * FROM users WHERE email = $1', [normalized])
      if (!other) {
        const existingQueued = await db.get(
          'SELECT * FROM friend_invites WHERE requester_id = $1 AND email = $2',
          [meId, normalized],
        )
        if (existingQueued) {
          return { id: existingQueued.id, status: 'pending', queued: true, friend: queuedRow(existingQueued).friend }
        }
        if (await countActive(meId) >= MAX_FRIENDS) {
          throw httpError(400, `Puedes tener hasta ${MAX_FRIENDS} amigos en el plan actual`)
        }
        const row = {
          id: randomUUID(),
          requester_id: meId,
          email: normalized,
          created_at: new Date().toISOString(),
        }
        await db.run(
          'INSERT INTO friend_invites (id, requester_id, email, created_at) VALUES ($1, $2, $3, $4)',
          [row.id, row.requester_id, row.email, row.created_at],
        )
        return { id: row.id, status: 'pending', queued: true, friend: queuedRow(row).friend }
      }

      await db.run(
        'DELETE FROM friend_invites WHERE requester_id = $1 AND email = $2',
        [meId, normalized],
      )

      const existing = await db.get(
        `SELECT * FROM friendships WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $3 AND addressee_id = $4)`,
        [meId, other.id, other.id, meId],
      )
      if (existing?.status === 'accepted') throw httpError(409, 'Ya son amigos')
      if (existing?.status === 'pending' && existing.requester_id === meId) {
        throw httpError(409, 'Ya le enviaste una solicitud')
      }
      if (existing?.status === 'pending' && existing.addressee_id === meId) {
        await db.run(
          `UPDATE friendships SET status = $1 WHERE id = $2`,
          ['accepted', existing.id],
        )
        return { id: existing.id, status: 'accepted', autoAccepted: true }
      }

      if (await countActive(meId) >= MAX_FRIENDS) {
        throw httpError(400, `Puedes tener hasta ${MAX_FRIENDS} amigos en el plan actual`)
      }

      const row = {
        id: randomUUID(),
        requester_id: meId,
        addressee_id: other.id,
        status: 'pending',
        created_at: new Date().toISOString(),
      }
      await db.run(
        `INSERT INTO friendships (id, requester_id, addressee_id, status, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [row.id, row.requester_id, row.addressee_id, row.status, row.created_at],
      )
      return { id: row.id, status: 'pending', friend: publicUser(other) }
    },

    async claimInvites(user) {
      if (!user?.id || !user.email) return { claimed: 0 }
      const email = normalizeEmail(user.email)
      const pending = await db.all('SELECT * FROM friend_invites WHERE email = $1', [email])
      let claimed = 0
      for (const invite of pending) {
        await db.run('DELETE FROM friend_invites WHERE id = $1', [invite.id])
        if (invite.requester_id === user.id) continue
        const existing = await db.get(
          `SELECT * FROM friendships WHERE (requester_id = $1 AND addressee_id = $2) OR (requester_id = $3 AND addressee_id = $4)`,
          [invite.requester_id, user.id, user.id, invite.requester_id],
        )
        if (existing) continue
        await db.run(
          `INSERT INTO friendships (id, requester_id, addressee_id, status, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [invite.id, invite.requester_id, user.id, 'pending', invite.created_at],
        )
        claimed += 1
      }
      return { claimed }
    },

    async setStatus(meId, friendshipId, status) {
      const queued = await db.get('SELECT * FROM friend_invites WHERE id = $1', [friendshipId])
      if (queued) {
        if (queued.requester_id !== meId) throw httpError(403, 'No forma parte de esta solicitud')
        await db.run('DELETE FROM friend_invites WHERE id = $1', [friendshipId])
        return { id: friendshipId, status: 'removed' }
      }

      const row = await db.get(`${FRIEND_SELECT} WHERE f.id = $1`, [friendshipId])
      if (!row) throw httpError(404, 'Solicitud no encontrada')
      if (status === 'accepted') {
        if (row.addressee_id !== meId) throw httpError(403, 'Solo quien recibe la solicitud puede aceptarla')
        if (row.status !== 'pending') throw httpError(409, 'Esa solicitud ya no está pendiente')
        await db.run(`UPDATE friendships SET status = $1 WHERE id = $2`, ['accepted', friendshipId])
        return { id: friendshipId, status: 'accepted' }
      }
      if (status === 'declined' || status === 'removed') {
        if (row.requester_id !== meId && row.addressee_id !== meId) {
          throw httpError(403, 'No forma parte de esta solicitud')
        }
        await db.run('DELETE FROM friendships WHERE id = $1', [friendshipId])
        return { id: friendshipId, status: 'removed' }
      }
      throw httpError(400, 'Acción no válida')
    },

    async requireAccepted(meId, friendshipId) {
      const row = await db.get(`${FRIEND_SELECT} WHERE f.id = $1`, [friendshipId])
      if (!row) throw httpError(404, 'Amistad no encontrada')
      if (row.status !== 'accepted') throw httpError(403, 'Todavía no son amigos')
      if (row.requester_id !== meId && row.addressee_id !== meId) {
        throw httpError(403, 'No forma parte de esta amistad')
      }
      return mapRow(row, meId)
    },

    async scheduleOf(meId, friendshipId) {
      const link = await this.requireAccepted(meId, friendshipId)
      const schedule = await readSchedule(link.friend.id)
      return { friendshipId, friend: link.friend, schedule }
    },

    async compare(meId, friendshipIds, clock) {
      const uniqueIds = [...new Set((friendshipIds || []).filter(Boolean))]
      const meSchedule = await readSchedule(meId)
      const meUser = await db.get('SELECT * FROM users WHERE id = $1', [meId])
      const people = [{
        id: meId,
        name: meUser?.name || 'Tú',
        schedule: meSchedule,
        self: true,
      }]
      for (const friendshipId of uniqueIds) {
        const link = await this.requireAccepted(meId, friendshipId)
        people.push({
          id: link.friend.id,
          name: link.friend.name,
          schedule: await readSchedule(link.friend.id),
          friendshipId,
        })
      }
      const slots = freeBlocksFor(people)
      const nowSlot = UDP_BLOCKS.find((block) =>
        toMinutes(block.start) <= clock.minutes && clock.minutes < toMinutes(block.end),
      ) || null
      const snapshot = people.map((person) => ({
        id: person.id,
        name: person.name,
        self: !!person.self,
        friendshipId: person.friendshipId,
        now: currentFriendBlock(person.schedule, { day: clock.day, minutes: clock.minutes }),
      }))
      return {
        people: snapshot,
        nowBlock: nowSlot,
        freeNow: nowSlot
          ? slots.find((slot) => slot.day === clock.day && slot.block.id === nowSlot.id)?.free ?? false
          : false,
        slots,
      }
    },
  }
}
