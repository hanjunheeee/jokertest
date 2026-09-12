/**
 * F-17 알림 상태.
 *
 * 알림의 진짜 원본은 서버(notifications 테이블)다. 이 store는 그 복원본과 live 전달을
 * 합쳐 화면에 보여줄 뿐이고, **기기에 저장하지 않는다**(persist 없음) — 계정 전환·로그아웃
 * 뒤에 이전 계정의 목록이 남지 않게 하는 가장 확실한 방법이 "애초에 남기지 않는 것"이다
 * (A-05).
 *
 * 계정 경계는 두 개의 세대 값으로 지킨다(economy.store.js의 requestGeneration과 같은
 * 관례):
 *   - accountGeneration: 인증 계정(uuid)이 바뀔 때마다 오른다. 모든 비동기 완료 지점이
 *     자신이 시작할 때 캡처한 값과 현재 값을 비교해, 다르면 결과를 조용히 버린다.
 *   - requestGeneration: 조회를 새로 시작할 때마다 오른다. **더 새 조회가 시작된 뒤**
 *     도착한 오래된 GET만 버린다 — live 수신이나 읽음 성공은 이 값을 올리지 않으므로,
 *     그 사이에 끝난 GET도 정상적으로 반영된다(아래 union 병합이 그 경우를 안전하게 만든다).
 *
 * 중복(AC-03)과 소리(A-04)의 키를 **분리**하는 것이 이 파일의 핵심이다:
 *   - displayed: 알림 행 id. 목록 표시·읽음 상태의 키다.
 *   - soundSeen: 원본 사건 키(source_key). "이 사건의 소리는 이미 처리했다"는 표식이며,
 *     목록에 행이 생겼다는 것만으로는 절대 소모되지 않는다. 그렇지 않으면 친구 요청의
 *     notification_created가 먼저 도착했을 때, 소리를 소유한 friend_request_received가
 *     뒤이어 도착해도 "이미 처리됨"으로 묻힌다.
 */
import { create } from "zustand"

import { useAuthStore } from "../../auth/store/auth.store.js"

// API 모듈은 **실제로 요청할 때** 동적으로 불러온다.
//
// 이유: notifications.api.js → shared/api/client.js → shared/env.js는 `import.meta.env`
// (Vite 빌드타임 치환)를 읽는다. 이 store는 useSfxRuntime·useFriendSocketEvents가
// 원본 사건 중복 판정을 물으려고 import하므로, 정적 import로 두면 소리·설정만 검증하는
// 기존 시험들까지 전부 env.js를 로드하다 터진다(그 시험들은 client.js를 쓰지 않으므로
// env를 mock할 이유가 없다). 동적 import는 그 체인을 첫 네트워크 호출까지 미룬다.
let apiOverride = null

/** 시험 전용 — 실제 네트워크 대신 주입한 함수를 쓴다(achievementService의 관례와 같다). */
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

/**
 * 알림 종류 → 설정 화면(GENERAL_SETTING_CHECKBOXES)의 표시 항목(A-03).
 * 친구 요청은 "친구 초대", 업적·시스템 안내는 "시스템 알림"을 따른다.
 * 모르는 종류는 어떤 설정에도 묶지 않고 항상 보여준다 — 서버가 새 종류를 추가했을 때
 * 조용히 사라지는 것보다 보이는 편이 낫다.
 */
export const NOTIFICATION_SETTING_KEY_BY_TYPE = Object.freeze({
  "friend-request": "friend-invite",
  achievement: "system-notification",
  system: "system-notification",
})

/** 서버가 내려준 알림 하나가 우리가 다룰 수 있는 형태인지. 아니면 버린다. */
function isUsableNotification(value) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false
  if (typeof value.id !== "string" || value.id.length === 0) return false
  if (typeof value.sourceKey !== "string" || value.sourceKey.length === 0) return false
  return true
}

/** 최신순(생성 시각 내림차순, 동시각은 id 내림차순)으로 안정 정렬한다. */
function compareNotifications(a, b) {
  const at = Date.parse(a?.createdAt ?? "")
  const bt = Date.parse(b?.createdAt ?? "")
  const av = Number.isNaN(at) ? 0 : at
  const bv = Number.isNaN(bt) ? 0 : bt
  if (av !== bv) return bv - av
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

/**
 * 행 id를 키로 한 **union** 병합(A-04).
 *
 * - 기존에만 있는 행을 지우지 않는다 → 오래 걸린 GET이 그 사이 도착한 live 행을 없애지
 *   못한다.
 * - read_at은 절대 null로 되돌리지 않는다 → 읽음 성공 뒤 도착한 오래된 GET이 미확인으로
 *   되돌리지 못한다. 양쪽에 값이 있으면 먼저 찍힌(최초) 시각을 유지한다.
 */
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
  /** 보관 목록 — 표시 설정과 무관하게 전부 담는다(A-03: 다시 켜면 그대로 나타나야 한다). */
  items: [],
  /** 소리 처리를 이미 소모한 원본 사건 키(source_key). 목록 표시로는 채워지지 않는다. */
  soundSeen: new Set(),
  /** 초기 목록 복원을 마쳤는가. 마치기 전에 온 live는 아래 버퍼에 둔다. */
  snapshotLoaded: false,
  /** 리스너를 먼저 달았기 때문에 snapshot보다 먼저 도착할 수 있는 사건들. */
  liveBuffer: [],
  open: false,
  /** 읽음 요청이 진행 중인 알림 id들. */
  readPendingIds: [],
  /** 읽음 실패 메시지(id → message). 실패를 성공으로 위장하지 않기 위해 남긴다(A-06). */
  readErrors: {},
  /** notifications_ready ACK 상태: idle | pending | sent | retry */
  readyState: "idle",
})

const initialState = () => ({
  accountId: null,
  accountGeneration: 0,
  requestGeneration: 0,
  ...initialAccountState(),
})

/** 현재 로그인 계정. 로그인 boolean만 남아 있고 uuid가 없으면 계정이 없는 것으로 본다. */
function readAuthAccountId() {
  const auth = useAuthStore.getState()
  return auth.isLoggedIn && typeof auth.user?.uuid === "string" && auth.user.uuid.length > 0
    ? auth.user.uuid
    : null
}

export const useNotificationsStore = create((set, get) => ({
  ...initialState(),

  /**
   * 인증 계정을 현재 값으로 맞춘다(A-05).
   *
   * 계정이 조금이라도 달라지면(로그아웃 · A→B 직접 전환 모두) 목록·선택·오류·열림 상태·
   * soundSeen·버퍼를 **전부** 버리고 두 세대 값을 올린다. 진행 중이던 GET·PATCH·ready
   * ACK는 완료 지점에서 세대를 비교해 스스로 무효가 된다.
   */
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

  /** 이 비동기 결과가 아직 유효한가(계정도 그대로, 더 새 조회도 없다). */
  isCurrent: (accountGeneration, requestGeneration) => {
    const state = get()
    if (state.accountGeneration !== accountGeneration) return false
    if (requestGeneration !== undefined && state.requestGeneration !== requestGeneration) return false
    return true
  },

  /**
   * 서버에서 전체 목록을 복원한다(AC-06).
   *
   * 복원 결과로는 **소리를 내지 않는다**. 대신 본 사건의 원본 키를 전부 soundSeen에 넣어,
   * 이후 같은 사건이 live로 늦게 도착해도 무음이 되게 한다(A-04). 재생기의 origin=restore
   * 억제는 표식을 남기지 않으므로 복원 중복 방지를 재생기에만 맡기지 않는다.
   */
  loadSnapshot: async () => {
    get().syncAccount()
    const { accountId, accountGeneration } = get()
    if (accountId === null) return { ok: false, reason: "anonymous" }

    const requestGeneration = get().requestGeneration + 1
    set({ requestGeneration, status: "loading", error: null })

    let data
    try {
      data = await callNotificationsApi("fetchNotificationsApi")
    } catch (error) {
      if (!get().isCurrent(accountGeneration, requestGeneration)) return { ok: false, reason: "stale" }
      // 실패를 빈 목록으로 위장하지 않는다 — 화면은 실패·재시도를 보여준다(AC-06).
      set({ status: "error", error: error?.message ?? "알림을 불러오지 못했습니다." })
      return { ok: false, reason: "error" }
    }

    if (!get().isCurrent(accountGeneration, requestGeneration)) return { ok: false, reason: "stale" }

    const rows = Array.isArray(data) ? data.filter(isUsableNotification) : []
    const state = get()
    const soundSeen = new Set(state.soundSeen)
    for (const row of rows) soundSeen.add(row.sourceKey)

    // 리스너를 먼저 달았기 때문에 snapshot보다 먼저 도착한 사건들이 있을 수 있다. 그것들은
    // 복원과 같은 취급이다(무음) — 원본 키를 soundSeen에 함께 넣고 목록에만 합친다.
    const buffered = state.liveBuffer.filter(isUsableNotification)
    for (const row of buffered) soundSeen.add(row.sourceKey)

    set({
      items: mergeNotifications(state.items, [...rows, ...buffered]),
      soundSeen,
      liveBuffer: [],
      snapshotLoaded: true,
      status: "success",
      error: null,
    })
    return { ok: true, count: rows.length }
  },

  /**
   * 이 원본 사건의 소리를 지금 처음 처리하는가(A-04).
   *
   * 세 종류가 모두 이 함수를 통과한다 — 친구(useFriendSocketEvents) · 업적(useSfxRuntime) ·
   * 시스템(useNotificationSocketEvents). SFX 봉투의 eventId가 곧 서버 source_key와 같은
   * 문자열이라 별도 매핑이 필요 없다.
   *
   * true를 돌려주는 순간 표식을 **소모**한다 — 설정 off·mute로 실제 소리가 나지 않아도
   * 마찬가지다. 그래야 설정을 다시 켰을 때 과거 사건이 다시 울리지 않는다(A-03).
   */
  consumeSoundEvent: (accountId, sourceKey) => {
    // 이 함수는 store 밖(친구·업적 수신 훅)에서도 불린다. 그쪽 훅들은 알림 계정 경계를
    // 직접 관리하지 않으므로, 여기서 한 번 맞춰 "아직 동기화되지 않아 계정이 null"이라는
    // 이유로 정상 사건이 조용히 묻히는 일을 막는다. 계정이 실제로 바뀐 뒤 도착한 늦은
    // 사건은 이 동기화로 상태가 비워진 뒤 아래 대조에서 걸린다.
    get().syncAccount()
    const state = get()
    if (accountId === null || accountId !== state.accountId) return false
    if (typeof sourceKey !== "string" || sourceKey.length === 0) return false
    if (state.soundSeen.has(sourceKey)) return false

    const soundSeen = new Set(state.soundSeen)
    soundSeen.add(sourceKey)
    set({ soundSeen })
    return true
  },

  /**
   * live로 도착한 알림 하나를 목록에 반영한다(AC-01).
   *
   * **소리를 소모하지 않는다.** 소리 적격성은 호출자가 consumeSoundEvent로 따로 묻는다 —
   * 그래야 목록 반영이 친구·업적의 최초 소리를 먼저 먹어버리지 않는다.
   *
   * @returns {{ applied: boolean, reason?: string }}
   */
  receiveLiveNotification: (accountId, notification) => {
    const state = get()
    if (accountId === null || accountId !== state.accountId) return { applied: false, reason: "account-mismatch" }
    if (!isUsableNotification(notification)) return { applied: false, reason: "invalid" }

    // 초기 복원 전에 온 사건은 버퍼에 둔다. 복원과 겹치면 그때 무음으로 합쳐진다.
    if (!state.snapshotLoaded) {
      set({ liveBuffer: [...state.liveBuffer, notification] })
      return { applied: false, reason: "buffered" }
    }

    set({ items: mergeNotifications(state.items, [notification]) })
    return { applied: true }
  },

  /**
   * 알림 하나를 읽음으로 확정한다(AC-02).
   *
   * 서버가 확정한 행으로만 상태를 바꾼다 — 실패하면 그 항목에 오류를 남기고 미확인 상태를
   * 그대로 둔다(성공으로 위장하지 않는다, A-06). 이 함수는 SFX completion을 기다리지
   * 않는다.
   */
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

    // 계정이 바뀐 뒤 도착한 응답은 새 계정의 목록을 건드리지 않는다(A-05).
    if (!get().isCurrent(accountGeneration)) return { ok: false, reason: "stale" }

    clearPending()
    if (isUsableNotification(row)) {
      set((state) => ({ items: mergeNotifications(state.items, [row]) }))
    }
    return { ok: true, notification: isUsableNotification(row) ? row : null }
  },

  /**
   * 재접속으로 새 소켓이 생겼다 — 다음 복원이 끝날 때까지 들어오는 사건을 **복원으로**
   * 취급한다(A-04). 그래서 snapshotLoaded를 내리고 버퍼를 비운다. 이미 받아 둔 목록과
   * soundSeen은 그대로 둔다 — 같은 계정이므로 과거 사건이 다시 울려서는 안 된다.
   */
  beginResync: () => set({ snapshotLoaded: false, liveBuffer: [], readyState: "pending" }),

  /** ready ACK 상태 기록. 실패해도 조회·읽음·닫기를 잠그지 않는다(AC-07). */
  setReadyState: (readyState) => set({ readyState }),

  openModal: () => set({ open: true }),
  closeModal: () => set({ open: false }),

  /** 항목별 읽음 실패 표시를 지운다(재시도 직전). */
  clearReadError: (notificationId) =>
    set((state) => ({
      readErrors: Object.fromEntries(
        Object.entries(state.readErrors).filter(([id]) => id !== notificationId),
      ),
    })),

  /** 시험·수동 초기화용. 런타임 코드에서는 쓰지 않는다. */
  __resetForTests: () => set(initialState()),
}))

/**
 * 표시 설정을 적용한 목록(A-03).
 *
 * 보관 목록(items)은 건드리지 않고 **표시만** 거른다 — 설정을 다시 켜면 숨겼던 행과
 * read_at이 그대로 다시 나타난다. 서버의 원본 친구 요청·보상·알림 행은 이 함수가 어떤
 * 값을 돌려주든 전혀 바뀌지 않는다(AC-04).
 */
export function selectVisibleNotifications(items, generalChecks) {
  const checks = generalChecks ?? {}
  return items.filter((item) => {
    const key = NOTIFICATION_SETTING_KEY_BY_TYPE[item.type]
    if (key === undefined) return true
    return checks[key] !== false
  })
}

/** 진입 버튼의 미확인 수 — 표시 가능한 항목만 센다(AC-04). */
export function selectUnreadCount(items, generalChecks) {
  return selectVisibleNotifications(items, generalChecks).filter((item) => !item.readAt).length
}
