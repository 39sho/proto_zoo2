#!/usr/bin/env node
// HTTP-level sync regression tests. No browser required — just a running stack
// (docker compose up -d && cargo run). Exercises the Electric semantics that are
// easy to break: txid handshake, insert/update streaming, separate-transaction
// aggregates, and shape authorization.
//
//   npm run test:sync
//   API_URL=http://localhost:8080 node scripts/sync-test.mjs

const API = process.env.API_URL ?? 'http://localhost:8080'
const ts = Date.now()
const USER = `sync-${ts}`
const OTHER = `sync-other-${ts}`

let passed = 0
let failed = 0

function assert(name, condition, detail) {
  if (condition) {
    passed += 1
    console.log(`  \u001b[32mPASS\u001b[0m ${name}`)
  } else {
    failed += 1
    console.log(`  \u001b[31mFAIL\u001b[0m ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

async function api(method, path, { body, user } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (user) headers['X-Dev-User'] = user
  const res = await fetch(API + path, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json = null
  try {
    json = text ? JSON.parse(text) : null
  } catch {
    /* non-JSON error body */
  }
  return { status: res.status, json }
}

const sep = (path) => (path.includes('?') ? '&' : '?')

async function subscribe(path, user) {
  const res = await fetch(`${API}${path}${sep(path)}offset=-1`, {
    headers: user ? { 'X-Dev-User': user } : {},
  })
  return {
    status: res.status,
    handle: res.headers.get('electric-handle'),
    offset: res.headers.get('electric-offset'),
    rows: await res.json(),
  }
}

async function poll(path, handle, offset, user, timeoutMs = 8000) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), timeoutMs)
  try {
    const res = await fetch(
      `${API}${path}${sep(path)}handle=${handle}&offset=${offset}&live=true`,
      { signal: ac.signal, headers: user ? { 'X-Dev-User': user } : {} },
    )
    return {
      handle: res.headers.get('electric-handle') ?? handle,
      offset: res.headers.get('electric-offset') ?? offset,
      rows: await res.json(),
    }
  } catch {
    return { handle, offset, rows: [] }
  } finally {
    clearTimeout(timer)
  }
}

const values = (rows) => rows.filter((r) => r.value).map((r) => r.value)

async function main() {
  console.log(`sync-test against ${API}\n`)

  // --- auth + write path returns a txid ------------------------------------
  const sync = await api('POST', '/api/me/sync', { user: USER, body: { display_name: 'Sync Test' } })
  assert('dev auth /api/me/sync', sync.status === 200 && sync.json?.id, `status ${sync.status}`)

  const ws = await api('POST', '/api/workspaces', { user: USER, body: { name: `sync-${ts}` } })
  assert('create workspace', ws.status === 200 && ws.json?.id, `status ${ws.status}`)
  const wid = ws.json.id

  const ch = await api('POST', `/api/workspaces/${wid}/channels`, {
    user: USER,
    body: { name: `general-${ts}`, visibility: 'public' },
  })
  assert('create channel', ch.status === 200 && ch.json?.id, `status ${ch.status}`)
  const cid = ch.json.id

  const msg = await api('POST', `/api/channels/${cid}/messages`, {
    user: USER,
    body: { id: crypto.randomUUID(), content: `hello-${ts}` },
  })
  assert('create message returns numeric txid', typeof msg.json?.txid === 'number', `txid=${msg.json?.txid}`)

  // --- insert streams over the shape ---------------------------------------
  console.log('\n[shape: insert streaming]')
  const messagesPath = `/api/shapes/messages?channel_id=${cid}`
  const sub = await subscribe(messagesPath, USER)
  assert('messages shape subscribes', sub.status === 200 && sub.handle, `status ${sub.status}`)

  const streamed = `streamed-${ts}`
  await api('POST', `/api/channels/${cid}/messages`, {
    user: USER,
    body: { id: crypto.randomUUID(), content: streamed },
  })
  let poll1 = await poll(messagesPath, sub.handle, sub.offset, USER)
  let all = [...sub.rows, ...poll1.rows]
  assert('new message is delivered via long-poll', values(all).some((v) => v.content === streamed))

  // --- reply + root reply_count (separate transaction) ---------------------
  console.log('\n[threads: reply_count streams on its own txid]')
  const root = await api('POST', `/api/channels/${cid}/messages`, {
    user: USER,
    body: { id: crypto.randomUUID(), content: `root-${ts}` },
  })
  const sub2 = await subscribe(messagesPath, USER) // fresh handle after root exists
  await api('POST', `/api/channels/${cid}/messages`, {
    user: USER,
    body: { id: crypto.randomUUID(), content: `reply-${ts}`, parent_id: root.json.id },
  })
  let rows = []
  let handle = sub2.handle
  let offset = sub2.offset
  for (let i = 0; i < 3; i++) {
    const p = await poll(messagesPath, handle, offset, USER)
    handle = p.handle
    offset = p.offset
    rows = rows.concat(p.rows)
    if (values(rows).some((v) => v.id === root.json.id && String(v.reply_count) === '1')) break
  }
  const merged = [...sub2.rows, ...rows]
  assert('reply insert streams', values(merged).some((v) => v.content === `reply-${ts}`))
  assert(
    'root reply_count update streams',
    values(merged).some((v) => v.id === root.json.id && String(v.reply_count) === '1'),
    `saw ${JSON.stringify(values(merged).map((v) => ({ id: v.id, reply_count: v.reply_count })))}`,
  )

  // --- authorization on shapes ---------------------------------------------
  console.log('\n[authz: private channel shape]')
  const priv = await api('POST', `/api/workspaces/${wid}/channels`, {
    user: USER,
    body: { name: 'secret', visibility: 'private' },
  })
  const privateShape = `/api/shapes/messages?channel_id=${priv.json.id}`
  const otherRes = await fetch(`${API}${privateShape}${sep(privateShape)}offset=-1`, {
    headers: { 'X-Dev-User': OTHER },
  })
  assert('private channel shape is 403 for non-members', otherRes.status === 403, `status ${otherRes.status}`)

  // --- reactions round-trip -------------------------------------------------
  console.log('\n[reactions: optimistic add/remove return txids]')
  const add = await api('POST', `/api/messages/${root.json.id}/reactions`, {
    user: USER,
    body: { emoji: '👍' },
  })
  assert('add reaction returns txid', add.status === 200 && typeof add.json?.txid === 'number')
  const reactionsPath = `/api/shapes/reactions?channel_id=${cid}`
  const subR = await subscribe(reactionsPath, USER)
  assert(
    'reaction appears in reactions shape',
    values(subR.rows).some((v) => v.message_id === root.json.id && v.emoji === '👍'),
  )
  const remove = await api(
    'DELETE',
    `/api/messages/${root.json.id}/reactions/${encodeURIComponent('👍')}`,
    { user: USER },
  )
  assert('remove reaction returns txid', remove.status === 200 && typeof remove.json?.txid === 'number')

  console.log(`\nRESULT: ${passed} passed, ${failed} failed`)
  process.exit(failed ? 1 : 0)
}

main().catch((error) => {
  console.error('sync-test crashed:', error)
  process.exit(1)
})
