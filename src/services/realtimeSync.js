import {
  doc,
  collection as firestoreCollection,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import { auth } from '../lib/firebase'
import { db } from '../lib/firebase'
import { useERPStore } from '../store/useERPStore'

const COLLECTION_NAMES = [
  'branches', 'stores', 'users', 'products', 'productEntries',
  'inventoryMovements', 'customers', 'suppliers', 'invoices', 'quotes',
  'receivables', 'payments', 'financialMovements', 'expenses', 'conduces',
  'creditNotes', 'serviceOrders', 'taxSequences', 'auditLogs',
]

const SINGLETON_NAMES = ['company', 'settings', 'cashRegister', 'categories', 'selectedBranch', 'documentCounters', 'reportStats', 'inventoryReports']
const SaaS_NAMES = ['companies', 'activeCompanyId', 'companyMemberships', 'tenantData']

const SYNC_DEBOUNCE_MS = 2000

let activeUid = ''
let unsubscribers = []
let unsubscribeStore = null
let applyingRemote = false
let applyingSyncMeta = false
let syncReady = false
let syncTimer = null
let previousState = null
let pendingState = null
let writeInFlight = false
let syncSuspended = false
let syncRetries = 0
let migrationDone = false

// ─── Path helpers ────────────────────────────────────────────────

function colPath(uid, name) {
  return `accounts/${uid}/${name}`
}

function colRef(uid, name) {
  return firestoreCollection(db, 'accounts', uid, name)
}

function docRef_ (uid, name, docId) {
  return doc(db, 'accounts', uid, name, docId)
}

function oldStateDocRef(uid) {
  return doc(db, 'accounts', uid, 'erp', 'state')
}

function oldStateDocPath(uid) {
  return `accounts/${uid}/erp/state`
}

// ─── Public API ──────────────────────────────────────────────────

export function startErpRealtimeSync(user) {
  stopErpRealtimeSync()
  if (!user?.uid) {
    useERPStore.setState({ syncStatus: 'offline', syncUserId: null, syncHydrated: false })
    return stopErpRealtimeSync
  }

  activeUid = user.uid
  syncSuspended = false
  previousState = null
  useERPStore.setState({
    currentUser: {
      id: user.uid,
      name: user.displayName || user.email || 'Usuario',
      email: user.email || '',
      role: 'Admin',
    },
    syncStatus: 'connecting',
    syncUserId: user.uid,
    syncHydrated: false,
    syncError: '',
  })

  initializeUserSync(user).catch((error) => {
    useERPStore.setState({ syncStatus: 'error', syncError: describeError(error) })
  })

  return stopErpRealtimeSync
}

export function stopErpRealtimeSync() {
  if (syncTimer) window.clearTimeout(syncTimer)
  syncTimer = null
  unsubscribers.forEach((fn) => fn())
  unsubscribers = []
  unsubscribeStore?.()
  unsubscribeStore = null
  activeUid = ''
  syncReady = false
  applyingRemote = false
  applyingSyncMeta = false
  previousState = null
  pendingState = null
  writeInFlight = false
  syncSuspended = false
  migrationDone = false
}

// ─── Initialization ──────────────────────────────────────────────

async function initializeUserSync(user) {
  const uid = user.uid
  await ensureAuthenticatedUser(user)

  // 1. Migrate from old monolithic erp/state to individual collections
  await migrateFromOldState(uid)

  // 2. Load all collections
  setSyncMeta({ syncStatus: 'syncing' })
  const loaded = {}
  for (const name of COLLECTION_NAMES) {
    try {
      const snapshot = await getDocs(colRef(uid, name))
      loaded[name] = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))
    } catch (error) {
      loaded[name] = []
    }
  }
  for (const name of SINGLETON_NAMES) {
    try {
      const d = await getDoc(docRef_(uid, '_singletons', name))
      loaded[name] = d.exists() ? d.data()?.value : null
    } catch (error) {
      loaded[name] = null
    }
  }
  for (const name of SaaS_NAMES) {
    loaded[name] = useERPStore.getState()[name] || (name === 'tenantData' ? {} : null)
  }

  // 3. Apply loaded state
  applyingRemote = true
  useERPStore.setState((state) => ({ ...state, ...loaded, syncHydrated: true }))
  applyingRemote = false

  // 4. Subscribe to real-time changes on each collection
  for (const name of COLLECTION_NAMES) {
    const unsub = onSnapshot(colRef(uid, name), (snapshot) => {
      if (snapshot.metadata.hasPendingWrites) return
      handleRemoteCollection(name, snapshot)
    }, (error) => handleSyncError(error))
    unsubscribers.push(unsub)
  }

  for (const name of SINGLETON_NAMES) {
    const unsub = onSnapshot(docRef_(uid, '_singletons', name), (snapshot) => {
      if (snapshot.metadata.hasPendingWrites) return
      if (snapshot.exists()) {
        applyingRemote = true
        useERPStore.setState({ [name]: snapshot.data()?.value ?? null })
        applyingRemote = false
      }
    }, (error) => handleSyncError(error))
    unsubscribers.push(unsub)
  }

  previousState = pickSyncState(useERPStore.getState())
  syncReady = true
  setSyncMeta({ syncStatus: 'synced', syncError: '' })

  // 5. Subscribe to local store changes
  unsubscribeStore = useERPStore.subscribe((state) => {
    if (!syncReady || syncSuspended || applyingRemote || applyingSyncMeta || !activeUid) return
    scheduleLocalSync(state)
  })
}

// ─── Migration ───────────────────────────────────────────────────

async function migrateFromOldState(uid) {
  if (migrationDone) return
  const ref = oldStateDocRef(uid)
  let snapshot
  try {
    snapshot = await getDoc(ref)
  } catch (error) {
    if (error?.message?.includes('exceeds the maximum allowed size')) {
      setSyncMeta({ syncStatus: 'syncing', syncHydrated: true, syncError: 'Migrando: leyendo estado local en vez del remoto...' })
    }
    migrationDone = true
    return
  }
  if (!snapshot.exists()) {
    migrationDone = true
    return
  }

  setSyncMeta({ syncStatus: 'syncing', syncHydrated: true, syncError: 'Migrando datos a nueva estructura de colecciones...' })

  const data = snapshot.data()?.state || {}
  let batch = writeBatch(db)
  let ops = 0

  for (const name of COLLECTION_NAMES) {
    const items = Array.isArray(data[name]) ? data[name] : []
    for (const item of items) {
      if (!item?.id) continue
      batch.set(docRef_(uid, name, item.id), sanitize(item))
      ops++
      if (ops >= 500) {
        await batch.commit()
        batch = writeBatch(db)
        ops = 0
      }
    }
  }
  for (const name of SINGLETON_NAMES) {
    if (data[name] !== undefined) {
      batch.set(docRef_(uid, '_singletons', name), { value: sanitize(data[name]), updatedAt: serverTimestamp() })
      ops++
      if (ops >= 500) {
        await batch.commit()
        batch = writeBatch(db)
        ops = 0
      }
    }
  }

  if (ops > 0) await batch.commit()

  // Delete old monolithic document
  try {
    await deleteDoc(ref)
  } catch (error) {
    // If deletion fails (e.g. doc still too large), that's ok - we won't use it anymore
  }

  migrationDone = true
  useERPStore.setState({ syncError: '' })
}

// ─── Remote change handling ──────────────────────────────────────

function handleRemoteCollection(name, snapshot) {
  if (applyingRemote) return
  applyingRemote = true

  const localState = useERPStore.getState()
  const localItems = Array.isArray(localState[name]) ? localState[name] : []
  const remoteItems = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }))

  const localMap = new Map(localItems.map((i) => [i.id, i]))
  const remoteMap = new Map(remoteItems.map((i) => [i.id, i]))

  // Detect items that existed in last synced state but are gone from local → locally deleted
  const locallyDeleted = new Set()
  if (previousState) {
    const prevItems = Array.isArray(previousState[name]) ? previousState[name] : []
    for (const item of prevItems) {
      if (item?.id && !localMap.has(item.id)) locallyDeleted.add(item.id)
    }
  }

  const merged = []

  // 1. Remote items: add/update; skip if locally-deleted with pending sync
  for (const item of remoteItems) {
    if (!item?.id) continue
    if (locallyDeleted.has(item.id) && pendingState) continue
    // When local writes are pending, prefer local version of same item
    merged.push(pendingState && localMap.has(item.id) ? localMap.get(item.id) : item)
  }

  // 2. Local-only items: keep only if we have pending local writes
  if (pendingState) {
    for (const item of localItems) {
      if (item?.id && !remoteMap.has(item.id)) merged.push(item)
    }
  }

  useERPStore.setState({ [name]: merged })
  previousState = pickSyncState(useERPStore.getState())
  applyingRemote = false
}

// ─── Local write direction ───────────────────────────────────────

function scheduleLocalSync(state) {
  pendingState = pickSyncState(state)
  if (syncTimer) window.clearTimeout(syncTimer)
  syncTimer = window.setTimeout(() => {
    syncTimer = null
    flushChanges().catch(handleSyncError)
  }, SYNC_DEBOUNCE_MS)
}

async function flushChanges() {
  if (!activeUid || syncSuspended || !pendingState || writeInFlight) return

  const nextState = pendingState
  if (previousState && stableStr(previousState) === stableStr(nextState)) {
    pendingState = null
    return
  }

  writeInFlight = true
  pendingState = null
  setSyncMeta({ syncStatus: 'syncing' })

  try {
    await writeDiff(activeUid, previousState || {}, nextState)
    previousState = nextState
    syncRetries = 0
    setSyncMeta({ syncStatus: 'synced', syncError: '' })
  } catch (error) {
    if (isBlocking(error)) {
      suspendSync(error)
      return
    }
    if (!pendingState) pendingState = nextState
    const delay = Math.min(10_000, (syncRetries + 1) * 2_000)
    syncRetries++
    syncTimer = window.setTimeout(() => {
      syncTimer = null
      flushChanges().catch(handleSyncError)
    }, delay)
    setSyncMeta({ syncStatus: 'error', syncError: describeError(error) })
    return
  } finally {
    writeInFlight = false
  }

  if (pendingState && (!previousState || stableStr(previousState) !== stableStr(pendingState))) {
    scheduleLocalSync(pendingState)
  }
}

async function writeDiff(uid, prev, next) {
  if (!auth.currentUser || auth.currentUser.uid !== uid) {
    throw new Error('La sesion de Firebase no esta lista para sincronizar.')
  }

  let batch = writeBatch(db)
  let ops = 0

  // Collections: diff and write individual docs
  for (const name of COLLECTION_NAMES) {
    const prevItems = Array.isArray(prev[name]) ? prev[name] : []
    const nextItems = Array.isArray(next[name]) ? next[name] : []

    const prevMap = new Map(prevItems.filter((i) => i?.id).map((i) => [i.id, i]))
    const nextMap = new Map(nextItems.filter((i) => i?.id).map((i) => [i.id, i]))

    // Added or updated items
    for (const item of nextItems) {
      if (!item?.id) continue
      const prevItem = prevMap.get(item.id)
      if (!prevItem || stableStr(prevItem) !== stableStr(item)) {
        batch.set(docRef_(uid, name, item.id), sanitize(item))
        ops++
        if (ops >= 500) { await batch.commit(); batch = writeBatch(db); ops = 0 }
      }
    }

    // Deleted items
    for (const [id] of prevMap) {
      if (!nextMap.has(id)) {
        batch.delete(docRef_(uid, name, id))
        ops++
        if (ops >= 500) { await batch.commit(); batch = writeBatch(db); ops = 0 }
      }
    }
  }

  // Singletons
  for (const name of SINGLETON_NAMES) {
    const prevVal = prev[name]
    const nextVal = next[name]
    if (stableStr(prevVal) !== stableStr(nextVal)) {
      if (nextVal !== undefined && nextVal !== null) {
        batch.set(docRef_(uid, '_singletons', name), { value: sanitize(nextVal), updatedAt: serverTimestamp() })
      } else {
        batch.delete(docRef_(uid, '_singletons', name))
      }
      ops++
      if (ops >= 500) { await batch.commit(); batch = writeBatch(db); ops = 0 }
    }
  }

  if (ops > 0) await batch.commit()
}

// ─── Helpers ─────────────────────────────────────────────────────

function pickSyncState(state) {
  const picked = {}
  COLLECTION_NAMES.forEach((name) => {
    picked[name] = Array.isArray(state[name]) ? dedupe(state[name]) : []
  })
  SINGLETON_NAMES.forEach((name) => {
    picked[name] = state[name]
  })
  SaaS_NAMES.forEach((name) => {
    picked[name] = state[name]
  })
  return picked
}

function dedupe(items) {
  const seen = new Set()
  return items.filter((item) => {
    if (!item?.id) return false
    if (seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

function sanitize(value) {
  if (value === undefined) return null
  if (value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(sanitize)
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, v]) => typeof v !== 'function' && v !== undefined)
      .map(([k, v]) => [k, sanitize(v)])
  )
}

function stableStr(value) {
  return JSON.stringify(value ?? null)
}

function isBlocking(error) {
  if (/permission-denied|unauthenticated/i.test(error?.code || '')) return true
  if (error?.message?.includes('exceeds the maximum allowed size')) {
    // Individual docs should never reach this limit, but handle gracefully
    suspendSync(error)
    return true
  }
  return false
}

function describeError(error) {
  const msg = error?.message || 'Error de sincronizacion'
  return error?.syncPath ? `${msg} (${error.syncPath})` : msg
}

function handleSyncError(error) {
  setSyncMeta({ syncStatus: 'error', syncError: describeError(error) })
}

function setSyncMeta(patch) {
  applyingSyncMeta = true
  useERPStore.setState(patch)
  applyingSyncMeta = false
}

function suspendSync(error) {
  if (syncTimer) window.clearTimeout(syncTimer)
  syncTimer = null
  syncSuspended = true
  syncReady = false
  pendingState = null
  setSyncMeta({
    syncStatus: 'error',
    syncError: `${describeError(error)}. Sincronizacion pausada.`,
  })
}

async function ensureAuthenticatedUser(user) {
  if (!user?.uid) throw new Error('No hay usuario autenticado para sincronizar.')
  await user.getIdToken()
}
