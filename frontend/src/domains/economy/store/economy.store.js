// F-08 서버 경제 상태 클라이언트. 상점·기억의 서고·마이페이지가 공통으로 보는 잔액·
// 소유품·장착 상태를 backend/routes/economy.routes.js에서 복원한다. 도메인 관례상 API
// 호출은 별도 *.api.js로 감싸지만, 이 작업의 계획된 새 파일은 이 store 하나뿐이라(수정
// 범위 문서) fetch 호출을 이 파일 안에 그대로 둔다.
//
// R-IMPL(2026-09-10, 반송) 대응 — 계정 격리: 이전 버전은 로그아웃/계정 전환에 전혀
// 반응하지 않았다. 로그아웃해도 이전 계정의 잔액·소유품·pendingPurchases가 그대로 남고,
// 이전 계정에 대한 fetch/purchase/equip 응답이 나중에 도착하면(응답 유실 후 지연 도착 등)
// 그 사이 로그인한 다음 계정의 상태를 덮어쓸 수 있었다. requestGeneration을 계정
// 전환/로그아웃마다 증가시키고, 모든 비동기 완료 지점에서 "요청을 시작한 시점의
// generation"과 "지금 generation"을 비교해 다르면(그 사이 계정이 바뀌었다면) 응답을
// 조용히 버린다 — 어느 계정이 요청했는지와 무관하게, 지금 로그인된 계정과 다른 데이터로
// 화면을 덮어쓰는 일을 막는다.
import { create } from "zustand"

import { api } from "../../../shared/api/client.js"
import { useAuthStore } from "../../auth/store/auth.store.js"

const initialLoadout = {
  selectedProfilePhotoId: null,
  selectedProfileBorderId: null,
  selectedCardFrameId: null,
  // F-14(AC-01): 직업별 장착 스킨. GET /entitlements(getWalletSummary)만 이 필드를 채운다 —
  // POST /economy/equip 응답(routes.js serializeLoadout)에는 이 필드가 없으므로, equip 성공
  // 뒤 이 값을 최신화하려면 fetchSummary로 다시 조회해야 한다(useSkinCardWearSelection.js
  // confirmLoadout 참고).
  selectedSkinsByJob: null,
  // F-13 AC-02(운영자 지시, 2026-09-11 22:12): 서버가 발급하는 CAS(compare-and-swap) 토큰.
  // equipProfile은 이 값을 expectedRevision으로 그대로 되돌려 보낸다 — 서버가 실제로 무엇을
  // 커밋했는지를 직접 보증하므로, 더 이상 클라이언트의 "시작 순서" 추측(loadoutAttemptSeq)
  // 만으로 화면 정합성을 지탱하지 않는다(economy.service.js의 equipProfileAppearance 참고).
  revision: null,
}

const initialState = {
  balanceGold: 0,
  balanceDiamond: 0,
  entitlements: [],
  loadout: initialLoadout,
  status: "idle", // idle | loading | ready | error
  error: null,
  // itemId별 구매 진행 상태. referenceEventId를 유지해 응답 유실 후 재시도가 같은
  // 참조 사건 ID를 재사용하게 한다(백엔드 재처리 방지 키, F-08 AC-02) — 그래야 "성공했는지
  // 모르는 채로 재시도"해도 서버가 중복 지급하지 않는다. status는 pending(진행 중)|
  // confirmed(서버가 성공 응답)|rejected(서버가 명시적으로 거부, code 있음)|unknown(응답을
  // 받지 못함 — 성공/실패를 알 수 없는 전송 불확실 상태) 중 하나다.
  pendingPurchases: {},
}

const resolveUserId = () => useAuthStore.getState().user?.uuid ?? null

// F-14(AC-01, R-IMPL P1 수정): POST /economy/equip 응답(routes.js serializeLoadout)에는
// selectedSkinsByJob이 없다(프로필 슬롯만 되돌려준다) — economy.service.js의 equipItem은
// 전부-아니면-무로 동작하므로(부분 적용 없이 던지거나 정확히 그 값으로 커밋한다), 이 요청이
// 실제로 보낸 (slot, itemId) 자체가 "서버가 지금 막 정확히 이 값으로 커밋했다"는 증거다.
// 별도 재조회(fetchSummary) 없이 이 응답만으로 직업별 스킨 미러를 직접 갱신하면, 여러 슬롯을
// 순서대로 equip하다가 다른 슬롯이 명시적으로 거부돼 재조회를 건너뛰어도 이미 성공한 슬롯의
// 미러가 stale로 남지 않는다. frontend/src/domains/user/hooks/useSkinCardWearSelection.js의
// JOB_ID_TO_SKIN_SLOT과 반대 방향의 같은 매핑이다(공유 모듈이 없어 독립적으로 든다).
const JOB_SKIN_SLOT_TO_JOB_ID = Object.freeze({
  JOB_SKIN_NOBLE: "noble",
  JOB_SKIN_CLOWN: "clown",
  JOB_SKIN_GUARD: "guard",
  JOB_SKIN_DOCTOR: "doctor",
  JOB_SKIN_WITCH_HUNTER: "witchHunter",
})

const buildReferenceEventId = (userId, itemId) =>
  `purchase:${userId}:${itemId}:${crypto.randomUUID()}`

// F-13 AC-02(운영자 지시, 2026-09-11 22:12: "replacing temporary unknown blocking/reset
// escape") — 겹치는 확정을 한 번에 하나씩만 실제로 전송하도록 직렬화한다(A-06 "정상 직렬
// 큐"). 이전 버전은 전송 불확실(응답 유실)이 한 번 생기면 profileOutcomeUnknown 플래그로
// 이후의 모든 확정을 로그아웃/재로그인 전까지 영구히 막았다 — 그러나 서버가 이제 영속
// revision을 CAS로 비교하므로(equipProfileAppearance) 그런 영구 차단이 더 이상 필요하지
// 않다: 뒤이은 확정이 실제로 전송되면, 그 사이 앞선 확정이 조용히 커밋됐었더라도 서버가
// 예전 revision을 보고 409로 거부해 스스로 재조정(authoritative GET)하게 만든다 — 정확성의
// 근거가 클라이언트의 불확실한 추측이 아니라 서버의 CAS 판정으로 옮겨졌다.
//
// F-14(AC-01, R-IMPL P1 "coherent persisted write ordering... integrating with profile
// writes rather than creating mutually independent queues") — equip()(직업 스킨·카드
// 프레임)과 equipProfile()(사진·테두리)은 모두 같은 EconomyLoadout 행·같은 revision
// 컬럼을 공유한다. 예전처럼 equip()을 독립된 요청으로 두면(CAS도 큐도 없이 매번 즉시
// 커밋) 두 진입점이 서로의 revision 변화를 모른 채 경쟁해 지연·역전된 응답이 더 최신
// 저장을 조용히 덮어쓸 수 있었다 — 이제 하나의 loadoutQueue로 이 행에 대한 모든 쓰기
// 시도(직업 스킨·카드 프레임·프로필 사진·테두리)를 실제로 보내는 순서까지 직렬화하고,
// 아래 sendLoadoutWrite 하나가 두 진입점 모두의 CAS 재조정을 담당한다.
let loadoutQueue = null

// F-13 AC-02(A-09): conflict 자동 재시도는 최초 POST 이후 최대 이 횟수만큼만 허용한다
// (초기 시도 1회 + 재시도 2회 = 최대 3회 실제 전송). 이 한도를 넘기거나 재조정용 GET
// 자체가 실패하면 draft·명확한 오류·사용자 재시도 경로를 남기고 더 이상 자동으로
// 재전송하지 않는다.
const MAX_LOADOUT_EQUIP_AUTO_RETRIES = 2

const SLOT_TO_LOADOUT_FIELD = Object.freeze({
  PROFILE_PHOTO: "selectedProfilePhotoId",
  PROFILE_BORDER: "selectedProfileBorderId",
  PLAYER_CARD_FRAME: "selectedCardFrameId",
})

/**
 * 공용 loadout 행 write 직렬화 + CAS 재조정(F-13/F-14 공유, 위 loadoutQueue 설명 참고).
 * endpoint에 buildBody(expectedRevision)의 결과를 POST하고, 서버가 conflictCode로
 * 거부하면 authoritative GET(entitlements)으로 재조정한다 — 요청한 슬롯이 이미 서버
 * 값과 같으면(matches) 재전송 없이 그 상태를 받아들이고, 다르면(requireKnownRevision을
 * 쓰는 호출자는) 최신 revision으로 같은 사용자 의도를 다시 보낸다. applyExtra(mergedLoadout)는
 * 서버 응답에 없는 필드(예: POST /economy/equip 응답에는 없는 selectedSkinsByJob)를 이
 * 요청 자체의 성공으로부터 직접 미러링할 때만 쓴다 — mergedLoadout은 이미 "이전 상태 +
 * 이번에 받은 loadout"이 합쳐진 값이라, authoritative GET으로 받아온 최신 다른 직업 스킨
 * 값을 실수로 덮어쓰지 않는다.
 *
 * F-14(AC-01, R-IMPL2 "MUST CLOSE UNVERSIONED PUBLIC WRITE") — requireKnownRevision이
 * true인 호출자(equip)는 revision을 아직 모르면(초기 로딩 전) 버전 없이 POST하는 대신
 * authoritative GET으로 먼저 읽는다 — 그 GET마저 실패하면 LOADOUT_REVISION_UNAVAILABLE로
 * 명확히 거부하고 버전 없이 전송하지 않는다. equipProfile은 이 옵션을 쓰지 않는다(F-13이
 * 이미 고정한 계약: revision을 아직 모르면 null을 그대로 실어 보낸다 — economy.store.test.js
 * "clientIntentAt... 대신 서버 CAS용 expectedRevision을 요청에 싣는다" 시험 참고).
 *
 * F-14(AC-01, R-IMPL2 "MUST CLOSE STALE CONFLICT REPLAY") — replayOnConflict가 false인
 * 호출자(equip)는 충돌 시 서버 값과 다르면(오래된 의도) 새 revision으로 자동 재전송하지
 * 않는다 — 서버 진실은 이미 반영했고, 사용자 draft는 호출부(훅)가 보관하므로 원래 conflict
 * 오류를 그대로 되돌려 명시적 재시도를 요구한다. equipProfile은 기존 F-13 자동 재조정
 * 계약(true, 기본값)을 그대로 유지한다.
 * @param {() => any} get @param {(fn: (state: any) => any) => void} set
 */
const sendLoadoutWrite = (get, set, {
  endpoint, buildBody, matches, applyExtra, conflictCode,
  requireKnownRevision = false, replayOnConflict = true,
}) => {
  const generation = get().requestGeneration
  const userId = resolveUserId()
  const isCurrent = () => Boolean(userId) && generation === get().requestGeneration && userId === resolveUserId()
  const sessionChangedError = () => Object.assign(new Error("계정이 변경되어 저장을 취소했습니다."), { code: "SESSION_CHANGED" })

  // withExtra=false는 "아직 이 요청 자신의 의도가 커밋됐다고 확정되지 않은" 중간 새로고침
  // (충돌 재조정 GET 직후)에 쓴다 — applyExtra는 이 요청이 실제로 원하는 값을 강제로
  // 미러링하므로, 성공이 확정되기 전에 적용하면 아직 서버에 보내지도 않은 값을 화면에
  // 낙관적으로 앞서 보여주게 된다. GET이 돌려준 다른 필드(예: 다른 직업의 최신 스킨)는
  // 재전송 여부와 무관하게 항상 정직하게 반영해야 하므로, merge 자체는 매번 수행한다.
  const applyLoadoutResult = (loadout, { withExtra = true } = {}) => {
    if (!isCurrent()) return
    set((state) => {
      const merged = { ...state.loadout, ...loadout }
      return {
        loadout: (withExtra && applyExtra) ? { ...merged, ...applyExtra(merged) } : merged,
        loadoutWriteSeq: state.loadoutWriteSeq + 1,
      }
    })
  }

  // 이 GET의 유일한 목적은 CAS 재조정에 쓸 현재 서버 loadout·revision을 읽는 것뿐이다 —
  // 지갑·소유품은 여기서 요청도·기록도 하지 않는다(F-13 AC-02 운영자 코드 리뷰,
  // 2026-09-12: fetchSummary만이 그 필드들의 신선도를 책임진다).
  const fetchAuthoritativeLoadout = async () => {
    if (!isCurrent()) throw sessionChangedError()
    const entitlementsResponse = await api.get(`/economy/accounts/${userId}/entitlements`)
    if (!isCurrent()) throw sessionChangedError()
    return entitlementsResponse.loadout
  }

  const attemptSend = async (expectedRevision, attemptNumber) => {
    if (!isCurrent()) throw sessionChangedError()
    try {
      const result = await api.post(endpoint, buildBody(expectedRevision))
      applyLoadoutResult(result.loadout)
      return result
    } catch (error) {
      if (!isCurrent()) throw error

      // 서버가 CAS 충돌로 명확히 거부한 경우만 재조정한다 — 전송 불확실(code 없음)과 그
      // 밖의 명시적 거부(소유권·종류 불일치 등)는 그대로 다시 던진다.
      const code = error?.code
      if (code !== conflictCode || attemptNumber > MAX_LOADOUT_EQUIP_AUTO_RETRIES) throw error

      let serverLoadout
      try {
        serverLoadout = await fetchAuthoritativeLoadout()
      } catch {
        // GET 자체가 실패했다 — 원래 오류(충돌)를 그대로 남긴다(초안 유지, 명확한 오류,
        // 사용자 재시도 경로). 조용히 무한 재시도하지 않는다.
        throw error
      }
      if (!isCurrent()) throw sessionChangedError()

      // serverLoadout은 항상 신선한 authoritative 상태다 — 재전송 여부와 무관하게 먼저
      // 정직하게 반영해 둔다(이 요청과 무관한 다른 필드의 최신 값도 함께 담고 있을 수
      // 있다). 아직 이 요청 자신의 의도가 커밋됐다고 확정되지 않았으므로 applyExtra(내가
      // 원하는 값 강제 반영)는 여기서 적용하지 않는다.
      applyLoadoutResult(serverLoadout, { withExtra: false })

      if (matches(serverLoadout)) {
        // 요청한 슬롯이 이미 서버 값과 같다 — 그 사이 이 요청(또는 동등한 다른 확정)이
        // 실제로는 커밋돼 있었다는 뜻이다. 재전송할 필요 없이 서버 진실을 그대로 받아들인다.
        return { loadout: serverLoadout, reconciled: true }
      }

      if (!replayOnConflict) {
        // F-14(AC-01, R-IMPL2 "MUST CLOSE STALE CONFLICT REPLAY") — 서버 값이 요청한
        // 값과 다르다(오래된 의도) — 서버 진실은 이미 위에서 반영했고, 사용자 draft는
        // 호출부(훅)가 보관하므로 여기서는 되돌리지 않는다. 오래된 의도를 새 revision으로
        // 자동 재전송하지 않고, 원래 conflict 오류를 그대로 되돌려 명시적 재시도를 요구한다.
        throw error
      }

      // 최신 사용자 의도를 최신 revision으로 다시 보낸다(F-13 프로필 자동 재조정 계약).
      return attemptSend(serverLoadout.revision, attemptNumber + 1)
    }
  }

  const run = async () => {
    let revision = get().loadout.revision
    if (requireKnownRevision && (typeof revision !== "string" || revision.length === 0)) {
      // F-14(AC-01, R-IMPL2 "MUST CLOSE UNVERSIONED PUBLIC WRITE") — 아직 revision을
      // 모르는 채(예: 초기 fetchSummary 완료 전) 저장을 시도하면, 버전 없는 POST로 서버가
      // 무조건 커밋하게 두는 대신 authoritative revision을 먼저 읽는다.
      if (!isCurrent()) throw sessionChangedError()
      let authoritative
      try {
        authoritative = await fetchAuthoritativeLoadout()
      } catch {
        if (!isCurrent()) throw sessionChangedError()
        // GET마저 실패했다 — 복구 가능한 명확한 오류로 남기고 버전 없이 전송하지 않는다
        // (초안 유지, 사용자 재시도 경로. 성공/확정 거부 어느 쪽도 아니다).
        throw Object.assign(
          new Error("장착 상태를 아직 불러오지 못해 저장할 수 없습니다. 다시 시도해 주세요."),
          { code: "LOADOUT_REVISION_UNAVAILABLE" },
        )
      }
      if (!isCurrent()) throw sessionChangedError()
      applyLoadoutResult(authoritative, { withExtra: false })
      revision = authoritative.revision
    }
    return attemptSend(revision, 1)
  }
  const result = loadoutQueue ? loadoutQueue.then(run) : run()
  const settled = result.then(() => undefined, () => undefined)
  loadoutQueue = settled
  settled.then(() => { if (loadoutQueue === settled) loadoutQueue = null })
  return result
}

export const useEconomyStore = create((set, get) => ({
  ...initialState,
  requestGeneration: 0,
  // F-13 AC-02 재검토(CODEX-5) — requestGeneration은 계정 경계만 가른다. 같은 계정 안에서도
  // 이전 equipProfile 시도의 뒤늦은 완료(성공이든, 그로 인한 재조회든)가 그 사이 새로
  // 시작된 더 최신 시도의 결과를 덮어쓸 수 있었다(완료 순서가 응답 도착 순서에 좌우되므로).
  // equipProfile을 호출할 때마다 이 값을 올려 "지금 사용자가 실제로 원하는 최신 확정
  // 시도"를 표시하고, loadout을 실제로 쓰는 모든 지점(equipProfile 자신의 성공 처리·
  // fetchSummary)이 자신이 시작된 이후 더 최신 시도가 생기지 않았을 때만 반영한다 — 오직
  // 가장 나중에 "시작된" 시도만 loadout을 쓸 자격이 있다(완료 순서가 아니라 시작 순서로
  // 승자를 가른다).
  loadoutAttemptSeq: 0,
  summaryRequestSeq: 0,
  loadoutWriteSeq: 0,

  /** 지갑 잔액·소유품·장착 상태를 서버에서 다시 읽어온다. */
  fetchSummary: async () => {
    const userId = resolveUserId()
    if (!userId) {
      set({ status: "error", error: "로그인이 필요합니다." })
      return { ok: false }
    }

    const generation = get().requestGeneration
    const attemptSeq = get().loadoutAttemptSeq
    const writeSeq = get().loadoutWriteSeq
    const summarySeq = get().summaryRequestSeq + 1
    set({ summaryRequestSeq: summarySeq, status: "loading", error: null })
    try {
      const [wallet, entitlementsResponse] = await Promise.all([
        api.get(`/economy/accounts/${userId}/wallet`),
        api.get(`/economy/accounts/${userId}/entitlements`),
      ])
      // 응답이 도착하기 전에 로그아웃했거나 다른 계정으로 전환됐다면, 이 응답은 더 이상
      // "현재 계정"의 것이 아니다 — 화면 상태를 덮어쓰지 않고 조용히 버린다.
      if (get().requestGeneration !== generation || get().summaryRequestSeq !== summarySeq) return { ok: false, stale: true }
      // F-13 AC-02(CODEX-6): 이 조회가 시작된 뒤 equipProfile로 더 최신 확정 시도가
      // 시작됐다면, 이 조회가 함께 받아온 loadout은 그 시도보다 오래된 정보일 수 있다 —
      // loadout만 덮어쓰지 않는다(그 최신 시도 자신의 완료가 진실을 확정한다). 지갑·소유품은
      // equipProfile이 바꾸는 값이 아니므로 loadout과 달리 보호가 필요 없다 — 같은 계정의
      // 유효한 조회 결과라면 그대로 반영하고 status도 "ready"까지 정상 종료한다(loadout
      // 하나만 보류할 뿐, summary 전체를 폐기하면 status가 "loading"에 멈춰 남는다).
      const loadoutApplied = get().loadoutAttemptSeq === attemptSeq && get().loadoutWriteSeq === writeSeq
      set((state) => ({
        balanceGold: wallet.balanceGold,
        balanceDiamond: wallet.balanceDiamond,
        entitlements: entitlementsResponse.entitlements,
        loadout: state.loadoutAttemptSeq === attemptSeq && state.loadoutWriteSeq === writeSeq ? entitlementsResponse.loadout : state.loadout,
        status: "ready",
        error: null,
      }))
      return { ok: loadoutApplied, stale: !loadoutApplied, loadout: loadoutApplied ? entitlementsResponse.loadout : undefined }
    } catch (error) {
      if (get().requestGeneration !== generation || get().summaryRequestSeq !== summarySeq) return { ok: false, stale: true }
      set({ status: "error", error: error.message ?? "지갑 정보를 불러오지 못했습니다." })
      return { ok: false, error }
    }
  },

  /** 마지막 실패를 그대로 다시 시도한다. */
  retry: () => get().fetchSummary(),

  /** @param {{ itemId: string }} params */
  purchase: async ({ itemId }) => {
    const userId = resolveUserId()
    if (!userId) throw new Error("로그인이 필요합니다.")

    const generation = get().requestGeneration
    const existingPending = get().pendingPurchases[itemId]
    // 응답 유실(전송 불확실, status "unknown")로 남은 대기만 같은 참조 사건 ID를
    // 재사용한다 — 서버가 이미 확정적으로 거부한(rejected) 시도는 결과가 이미 확정됐으므로
    // 다음 시도는 새 참조 사건 ID로 취급한다.
    const referenceEventId = existingPending?.status === "unknown"
      ? existingPending.referenceEventId
      : buildReferenceEventId(userId, itemId)

    set((state) => ({
      pendingPurchases: {
        ...state.pendingPurchases,
        [itemId]: { referenceEventId, status: "pending", error: null, code: null },
      },
    }))

    try {
      const result = await api.post("/economy/purchase", { itemId, referenceEventId })
      if (get().requestGeneration !== generation) return result
      set((state) => ({
        pendingPurchases: {
          ...state.pendingPurchases,
          [itemId]: { referenceEventId, status: "confirmed", error: null, code: null },
        },
      }))
      await get().fetchSummary()
      return result
    } catch (error) {
      if (get().requestGeneration !== generation) throw error

      // backend/utils/appError.js의 createError는 서버가 실제로 처리해 거부한 응답에
      // 항상 code를 싣는다(handleApiResponse/toApiError, shared/api/response.js). code가
      // 있으면 "서버가 응답했고 명시적으로 거부했다"는 확정된 사실이고, code가 없으면
      // fetch 자체가 실패했거나(네트워크 단절 등 TypeError) 응답을 받지 못한 것이라
      // 성공/실패를 알 수 없는 전송 불확실 상태다 — 이 둘을 구분해야 재시도 전략(같은
      // 참조 사건 ID 재사용 여부)이 달라진다(F-08 R-IMPL: "distinguish confirmed server
      // rejection from transport uncertainty").
      const confirmedRejection = typeof error.code === "string" && error.code.length > 0
      set((state) => ({
        pendingPurchases: {
          ...state.pendingPurchases,
          [itemId]: {
            referenceEventId,
            status: confirmedRejection ? "rejected" : "unknown",
            error: error.message ?? (confirmedRejection ? "구매가 거부되었습니다." : "구매 요청에 실패했습니다."),
            code: confirmedRejection ? error.code : null,
          },
        },
      }))
      throw error
    }
  },

  /** 응답을 잃어버렸거나(unknown) 거부된(rejected) 구매를 다시 시도한다. unknown이면
   *  같은 참조 사건 ID를 재사용하고, rejected면 새 시도로 취급해 새 참조 사건 ID를 쓴다. */
  retryPurchase: (itemId) => get().purchase({ itemId }),

  /** F-14(AC-01, R-IMPL P1 "coherent persisted write ordering") — 직업 스킨·카드 프레임
   *  장착도 이제 equipProfile과 같은 CAS·직렬 큐(loadoutQueue, sendLoadoutWrite)를 공유한다.
   *  지금 알고 있는 loadout.revision을 expectedRevision으로 함께 보내고, 서버가
   *  409(SKIN_REVISION_CONFLICT)로 거부하면 authoritative GET으로 재조정한다 — 지연되거나
   *  응답 순서가 뒤바뀐 요청이 더 최신 저장을 덮어쓰지 못한다. 응답(routes.js
   *  serializeEquipLoadout)에는 이제 selectedSkinsByJob이 실제로 포함되어 오지만, 그
   *  응답에는 서버가 이 요청 자신의 의도를 그대로 커밋했다는 사실만 있을 뿐 다른 미확정
   *  슬롯과의 병합 규칙까지는 담지 않으므로, applyExtra는 이 요청이 실제로 보낸
   *  (jobId, itemId) 자체로부터 직접 반영한다 — equipItem은 전부-아니면-무로 동작하므로
   *  성공은 곧 서버가 정확히 이 값으로 커밋했다는 증거다.
   *
   *  R-IMPL2(2026-09-12, CODEX-2 "MUST CLOSE UNVERSIONED PUBLIC WRITE"/"MUST CLOSE STALE
   *  CONFLICT REPLAY") — equipProfile과 달리 두 가지를 더 강제한다: (1) requireKnownRevision —
   *  revision을 아직 모르면 버전 없이 전송하는 대신 authoritative GET을 먼저 시도하고, 그마저
   *  실패하면 LOADOUT_REVISION_UNAVAILABLE로 명확히 거부한다(버전 없는 커밋 금지). (2)
   *  replayOnConflict:false — 충돌 후 서버 값이 요청과 다르면(오래된 의도) 자동으로
   *  재전송하지 않는다. 서버 진실은 반영하고, 원래 SKIN_REVISION_CONFLICT 오류를 그대로
   *  되돌려 훅이 명시적 거부로 처리하게 한다(useSkinCardWearSelection.js의
   *  CONFIRMED_EQUIP_REJECTION_CODES 참고) — F-13 프로필의 자동 재조정(replayOnConflict
   *  기본값 true)과 다른 이 슬라이스만의 계약이다.
   *  requireKnownRevision/replayOnConflict은 실제 F-14 소비 경로인 직업 스킨·카드 프레임
   *  슬롯에만 적용한다(isSkinOrCardSlot) — PROFILE_PHOTO/PROFILE_BORDER를 이 제네릭
   *  equip()으로 직접 호출하는 것은 이 슬라이스 범위 밖의 기존 계약
   *  (profileBorderHydration.test.js)이라 그 두 슬롯의 기존 동작(버전 없어도 즉시 전송,
   *  충돌 시 자동 재조정)은 그대로 둔다 — 실제 UI는 사진·테두리에 항상 equipProfile()을
   *  쓴다.
   *  @param {{ slot: "PROFILE_PHOTO" | "PROFILE_BORDER" | "PLAYER_CARD_FRAME" | "JOB_SKIN_NOBLE" | "JOB_SKIN_CLOWN" | "JOB_SKIN_GUARD" | "JOB_SKIN_DOCTOR" | "JOB_SKIN_WITCH_HUNTER", itemId: string }} params */
  equip: ({ slot, itemId }) => {
    const jobId = JOB_SKIN_SLOT_TO_JOB_ID[slot]
    const field = jobId ? null : SLOT_TO_LOADOUT_FIELD[slot]
    const isSkinOrCardSlot = Boolean(jobId) || slot === "PLAYER_CARD_FRAME"
    return sendLoadoutWrite(get, set, {
      endpoint: "/economy/equip",
      buildBody: (expectedRevision) => (isSkinOrCardSlot
        ? { slot, itemId, expectedRevision }
        : { slot, itemId, ...(expectedRevision ? { expectedRevision } : {}) }),
      applyExtra: jobId
        ? (merged) => ({ selectedSkinsByJob: { ...merged.selectedSkinsByJob, [jobId]: itemId } })
        : undefined,
      matches: (serverLoadout) => (jobId
        ? (serverLoadout.selectedSkinsByJob?.[jobId] ?? null) === itemId
        : field
          ? serverLoadout[field] === itemId
          : false),
      conflictCode: "SKIN_REVISION_CONFLICT",
      requireKnownRevision: isSkinOrCardSlot,
      replayOnConflict: !isSkinOrCardSlot,
    })
  },

  /** F-13 AC-01/AC-02: 프로필 수정 모달의 확인 한 번을 사진·테두리 동시 확정 요청 하나로
   *  보낸다. 실제로 바뀐 슬롯만 넘기면 되고(다른 슬롯은 undefined로 넘겨 건드리지 않는다),
   *  서버가 두 슬롯을 함께 검증·저장한 뒤 돌려준 loadout만 반영한다 — 명시적 거부(소유권·
   *  종류 불일치 등)는 아무 것도 반영하지 않고 그대로 던진다(이전 장착 상태 유지).
   *
   *  F-13 AC-02(운영자 지시, 2026-09-11 22:12) — 서버 CAS 재조정: 요청마다 지금 알고 있는
   *  loadout.revision을 expectedRevision으로 함께 보낸다. 서버가 409(PROFILE_REVISION_CONFLICT)
   *  로 거부하면(다른 확정이 그 사이 먼저 커밋됐다는 서버의 확정적 신호) authoritative GET
   *  으로 현재 서버 loadout·revision을 다시 읽는다 — 요청한 슬롯이 이미 그 값과 같으면 그
   *  서버 진실을 그대로 받아들이고(재전송 불필요, 성공으로 취급), 다르면 최신 revision으로
   *  같은 사용자 의도를 자동으로 다시 보낸다(최대 MAX_LOADOUT_EQUIP_AUTO_RETRIES회).
   *
   *  전송 불확실(응답 자체를 받지 못함, code 없음)과 그 외 명시적 거부(ITEM_NOT_OWNED 등)는
   *  이 함수가 재조정하지 않고 그대로 다시 던진다 — 전송 불확실의 authoritative GET 재조정은
   *  이미 호출부(useProfileBorderEditor.js의 handleConfirm)가 fetchSummary로 수행하고 있다
   *  (A-11: 오류 표시·초안 유지·편집기 미닫힘·사용자 재시도 복구 계약). 여기서 또 한 번
   *  재조정하면 호출을 중복시킬 뿐 아니라, "정말 실패했는지 아직도 알 수 없는" 상태를 조용히
   *  자동 재전송으로 덮어써 A-11의 관찰 가능성(사용자가 매 시도의 결과를 직접 확인할 수
   *  있어야 한다)을 없앤다 — 그래서 자동 재시도는 서버가 명확하게 "다른 값이 이미 커밋됐다"
   *  고 알려주는 conflict에만 적용한다. "영구 차단 후 재로그인 요구"였던 이전
   *  profileOutcomeUnknown 방식과 달리, 이 재조정은 요청마다 독립적으로 이뤄지므로 뒤이은
   *  확정(다음 handleConfirm 클릭 등)을 막지 않는다.
   *
   *  R-IMPL(2026-09-12, "integrating with profile writes rather than creating mutually
   *  independent queues") — 실제 요청 전송은 equip()과 같은 sendLoadoutWrite/loadoutQueue를
   *  공유한다. loadoutAttemptSeq는 여전히 이 함수만 올린다(fetchSummary가 "이 GET이 더 최신
   *  equipProfile 시도보다 오래됐는지"를 가리는 데만 쓴다 — applyLoadoutResult 자체는
   *  이전과 같이 attemptSeq로 결과를 가리지 않는다, 계정만 확인해 항상 반영한다).
   *  @param {{ photoItemId?: string, borderItemId?: string }} params */
  equipProfile: ({ photoItemId, borderItemId }) => {
    set((state) => ({ loadoutAttemptSeq: state.loadoutAttemptSeq + 1 }))
    return sendLoadoutWrite(get, set, {
      endpoint: "/economy/equip-profile",
      buildBody: (expectedRevision) => ({ photoItemId, borderItemId, expectedRevision }),
      matches: (serverLoadout) => (
        (photoItemId === undefined || serverLoadout.selectedProfilePhotoId === photoItemId)
        && (borderItemId === undefined || serverLoadout.selectedProfileBorderId === borderItemId)
      ),
      conflictCode: "PROFILE_REVISION_CONFLICT",
    })
  },

  /** 계정 경계를 넘는 모든 상태를 지우고 진행 중이던 요청들을 전부 무효화한다
   *  (requestGeneration 증가) — 그 뒤에 도착하는 이전 계정의 응답은 전부 무시된다. */
  reset: () => {
    loadoutQueue = null
    set((state) => ({
    ...initialState,
    pendingPurchases: {},
    requestGeneration: state.requestGeneration + 1,
  }))
  },
}))

// 로그아웃(user → null)이든 다른 계정으로 전환(uuid 변경)이든, 계정 식별자가 바뀌는
// 순간 즉시 리셋한다 — 화면이 다시 fetchSummary를 부르기 전까지 이전 계정의 잔액·소유품이
// 그대로 보이거나, 전환 도중이던 요청이 새 계정 화면에 뒤늦게 반영되는 것을 막는다.
useAuthStore.subscribe((state, prevState) => {
  const nextUserId = state.user?.uuid ?? null
  const prevUserId = prevState?.user?.uuid ?? null
  if (nextUserId !== prevUserId) {
    useEconomyStore.getState().reset()
  }
})
