import { create } from "zustand"

import { useAuthStore } from "../../auth/store/auth.store.js"

let apiOverride = null

export function __setNotificationsApiForTests(next) {
  apiOverride = next ?? null
}

async function callNotificationsApi(name, ...args) {
  if (apiOverride !== null && typeof apiOverride[name] === "function") {
    return apiOverride[name](...args)
  }
  const module = await import("../api/notifications.api.js")
  return module[name](...args)
}

export const NOTIFICATION_SETTING_KEY_BY_TYPE = Object.freeze({
  "friend-request": "friend-invite",
  "game-invite": "game-invite",
  achievement: "system-notification",
  system: "system-notification",
})

function isUsableNotification(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  if (typeof value.id !== "string" || value.id.length === 0) return false
  if (typeof value.sourceKey !== "string" || value.sourceKey.length === 0) return false
  return true
}

export function isNotificationBackedSourceKey(sourceKey) {
  if (typeof sourceKey !== "string") return false
  if (sourceKey.startsWith("system:")) return true
  if (/^friend-request:[^:]+:received$/.test(sourceKey)) return true
  if (/^achievement:[^:]+:granted$/.test(sourceKey)) return true
  if (/^game-invite:[^:]+:received$/.test(sourceKey)) return true
  return false
}

export function isConfirmedReadRow(row, notificationId) {
  if (!isUsableNotification(row)) return false
  if (row.id !== notificationId) return false
  const readAt = row.readAt ?? null
  if (readAt === null) return false
  if (readAt instanceof Date) return Number.isFinite(readAt.getTime())
  if (typeof readAt !== "string" || readAt.trim().length === 0) return false
  return Number.isFinite(Date.parse(readAt))
}

function compareNotifications(a, b) {
  const at = Date.parse(a?.createdAt ?? "")
  const bt = Date.parse(b?.createdAt ?? "")
  const av = Number.isNaN(at) ? 0 : at
  const bv = Number.isNaN(bt) ? 0 : bt
  if (av !== bv) return bv - av
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

export function mergeNotifications(existing, incoming) {
  const byId = new Map()
  for (const item of existing) byId.set(item.id, item)

  for (const raw of incoming) {
    if (!isUsableNotification(raw)) continue
    const previous = byId.get(raw.id)
    if (previous === undefined) {
      byId.set(raw.id, raw)
      continue
    }
    const previousRead = previous.readAt ?? null
    const incomingRead = raw.readAt ?? null
    let readAt = previousRead ?? incomingRead
    if (previousRead !== null && incomingRead !== null) {
      readAt = Date.parse(previousRead) <= Date.parse(incomingRead) ? previousRead : incomingRead
    }
    byId.set(raw.id, { ...previous, ...raw, readAt })
  }

  return [...byId.values()].sort(compareNotifications)
}

const initialAccountState = () => ({
  status: "idle", // idle | loading | success | error
  error: null,
  items: [],
  soundSeen: new Set(),
  snapshotLoaded: false,
  restorePending: false,
  liveBuffer: [],
  open: false,
  readPendingIds: [],
  readErrors: {},
  deleteReadPending: false,
  deleteReadError: null,
  readyState: "idle",
})

const initialState = () => ({
  accountId: null,
  accountGeneration: 0,
  requestGeneration: 0,
  ...initialAccountState(),
})

function readAuthAccountId() {
  const auth = useAuthStore.getState()
  return auth.isLoggedIn && typeof auth.user?.uuid === "string" && auth.user.uuid.length > 0
    ? auth.user.uuid
    : null
}

export const useNotificationsStore = create((set, get) => ({
  ...initialState(),

  syncAccount: () => {
    const next = readAuthAccountId()
    const state = get()
    if (state.accountId === next) return state.accountGeneration

    const accountGeneration = state.accountGeneration + 1
    set({
      accountId: next,
      accountGeneration,
      requestGeneration: state.requestGeneration + 1,
      ...initialAccountState(),
    })
    return accountGeneration
  },

  isCurrent: (accountGeneration, requestGeneration) => {
    const state = get()
    if (state.accountGeneration !== accountGeneration) return false
    if (requestGeneration !== undefined && state.requestGeneration !== requestGeneration) return false
    return true
  },

  loadSnapshot: async () => {
    get().syncAccount()
    const { accountId, accountGeneration } = get()
    if (accountId === null) return { ok: false, reason: "anonymous" }

    const requestGeneration = get().requestGeneration + 1
    set({ requestGeneration, status: "loading", error: null, restorePending: true })

    let data
    try {
      data = await callNotificationsApi("fetchNotificationsApi")
    } catch (error) {
      if (!get().isCurrent(accountGeneration, requestGeneration)) return { ok: false, reason: "stale" }
      set({ status: "error", error: error?.message ?? "알림을 불러오지 못했습니다." })
      return { ok: false, reason: "error" }
    }

    if (!get().isCurrent(accountGeneration, requestGeneration)) return { ok: false, reason: "stale" }

    const rows = Array.isArray(data) ? data.filter(isUsableNotification) : []
    const state = get()
    const soundSeen = new Set(state.soundSeen)
    for (const row of rows) soundSeen.add(row.sourceKey)

    const buffered = state.liveBuffer.filter(isUsableNotification)
    for (const row of buffered) soundSeen.add(row.sourceKey)

    set({
      items: mergeNotifications(state.items, [...rows, ...buffered]),
      soundSeen,
      liveBuffer: [],
      snapshotLoaded: true,
      restorePending: false,
      status: "success",
      error: null,
    })
    return { ok: true, count: rows.length }
  },

  consumeSoundEvent: (accountId, sourceKey) => {
    get().syncAccount()
    const state = get()
    if (accountId === null || accountId !== state.accountId) return false
    if (typeof sourceKey !== "string" || sourceKey.length === 0) return false
    if (state.soundSeen.has(sourceKey)) return false

    if (!state.snapshotLoaded && state.restorePending && isNotificationBackedSourceKey(sourceKey)) {
      return false
    }

    const soundSeen = new Set(state.soundSeen)
    soundSeen.add(sourceKey)
    set({ soundSeen })
    return true
  },

  receiveLiveNotification: (accountId, notification) => {
    const state = get()
    if (accountId === null || accountId !== state.accountId) return { applied: false, reason: "account-mismatch" }
    if (!isUsableNotification(notification)) return { applied: false, reason: "invalid" }

    if (!state.snapshotLoaded) {
      set({ liveBuffer: [...state.liveBuffer, notification] })
      return { applied: false, reason: "buffered" }
    }

    set({ items: mergeNotifications(state.items, [notification]) })
    return { applied: true }
  },

  markRead: async (notificationId) => {
    const { accountId, accountGeneration } = get()
    if (accountId === null) return { ok: false, reason: "anonymous" }
    if (typeof notificationId !== "string" || notificationId.length === 0) {
      return { ok: false, reason: "invalid" }
    }

    set((state) => ({
      readPendingIds: state.readPendingIds.includes(notificationId)
        ? state.readPendingIds
        : [...state.readPendingIds, notificationId],
      readErrors: Object.fromEntries(
        Object.entries(state.readErrors).filter(([id]) => id !== notificationId),
      ),
    }))

    const clearPending = () =>
      set((state) => ({ readPendingIds: state.readPendingIds.filter((id) => id !== notificationId) }))

    let row
    try {
      row = await callNotificationsApi("markNotificationReadApi", notificationId)
    } catch (error) {
      if (!get().isCurrent(accountGeneration)) return { ok: false, reason: "stale" }
      clearPending()
      set((state) => ({
        readErrors: { ...state.readErrors, [notificationId]: error?.message ?? "읽음 처리에 실패했습니다." },
      }))
      return { ok: false, reason: "error" }
    }

    if (!get().isCurrent(accountGeneration)) return { ok: false, reason: "stale" }

    clearPending()

    if (!isConfirmedReadRow(row, notificationId)) {
      set((state) => ({
        readErrors: {
          ...state.readErrors,
          [notificationId]: "읽음 확정 응답을 받지 못했습니다. 다시 시도해 주세요.",
        },
      }))
      return { ok: false, reason: "unconfirmed" }
    }

    set((state) => ({ items: mergeNotifications(state.items, [row]) }))
    return { ok: true, notification: row }
  },

  beginResync: () =>
    set({ snapshotLoaded: false, restorePending: true, liveBuffer: [], readyState: "pending" }),

  setReadyState: (readyState) => set({ readyState }),

  markVisibleUnreadAsRead: async (generalChecks) => {
    const { accountId, accountGeneration } = get()
    if (accountId === null) return { ok: false, reason: "anonymous" }

    const visible = selectVisibleNotifications(get().items, generalChecks)
    const unread = visible.filter((item) => !item.readAt)
    if (unread.length === 0) return { ok: true, marked: 0 }

    const unreadIds = new Set(unread.map((item) => item.id))
    const optimisticAt = new Date().toISOString()

    set((state) => ({
      items: state.items.map((item) =>
        unreadIds.has(item.id) ? { ...item, readAt: optimisticAt } : item,
      ),
    }))

    const results = await Promise.all(
      unread.map(async (item) => {
        try {
          const row = await callNotificationsApi("markNotificationReadApi", item.id)
          if (!isConfirmedReadRow(row, item.id)) return { id: item.id, ok: false, row: null }
          return { id: item.id, ok: true, row }
        } catch {
          return { id: item.id, ok: false, row: null }
        }
      }),
    )

    if (!get().isCurrent(accountGeneration)) return { ok: false, reason: "stale" }

    const failedIds = results.filter((result) => !result.ok).map((result) => result.id)
    const succeededRows = results.filter((result) => result.ok).map((result) => result.row)

    set((state) => ({
      items: mergeNotifications(
        state.items.map((item) => (failedIds.includes(item.id) ? { ...item, readAt: null } : item)),
        succeededRows,
      ),
    }))

    return {
      ok: failedIds.length === 0,
      marked: unread.length - failedIds.length,
      failed: failedIds.length,
    }
  },

  deleteReadNotifications: async () => {
    const { accountId, accountGeneration } = get()
    if (accountId === null) return { ok: false, reason: "anonymous" }

    const readItems = get().items.filter((item) => item.readAt)
    if (readItems.length === 0) return { ok: true, deleted: 0 }

    const snapshot = get().items
    const readIds = new Set(readItems.map((item) => item.id))

    set({
      deleteReadPending: true,
      deleteReadError: null,
      items: snapshot.filter((item) => !readIds.has(item.id)),
      readErrors: Object.fromEntries(
        Object.entries(get().readErrors).filter(([id]) => !readIds.has(id)),
      ),
      readPendingIds: get().readPendingIds.filter((id) => !readIds.has(id)),
    })

    try {
      await callNotificationsApi("deleteReadNotificationsApi")
    } catch (error) {
      if (!get().isCurrent(accountGeneration)) return { ok: false, reason: "stale" }
      set({
        deleteReadPending: false,
        deleteReadError: error?.message ?? "읽은 메시지를 삭제하지 못했습니다.",
        items: snapshot,
      })
      return { ok: false, reason: "error" }
    }

    if (!get().isCurrent(accountGeneration)) return { ok: false, reason: "stale" }

    set({ deleteReadPending: false, deleteReadError: null })
    return { ok: true, deleted: readItems.length }
  },

  clearDeleteReadError: () => set({ deleteReadError: null }),

  openModal: () => set({ open: true }),
  closeModal: () => set({ open: false, deleteReadError: null }),

  clearReadError: (notificationId) =>
    set((state) => ({
      readErrors: Object.fromEntries(
        Object.entries(state.readErrors).filter(([id]) => id !== notificationId),
      ),
    })),

  __resetForTests: () => set(initialState()),
}))

export function selectVisibleNotifications(items, generalChecks) {
  const checks = generalChecks ?? {}
  return items.filter((item) => {
    const key = NOTIFICATION_SETTING_KEY_BY_TYPE[item.type]
    if (key === undefined) return true
    return checks[key] !== false
  })
}

export function selectUnreadCount(items, generalChecks) {
  return selectVisibleNotifications(items, generalChecks).filter((item) => !item.readAt).length
}
