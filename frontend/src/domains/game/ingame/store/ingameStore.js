// 파일 역할: ingameStore.js - 전역 상태 store입니다.
import { create } from "zustand"
import { applyTribunalResolvedPure } from "./applyTribunalResolved.js"
import { applySessionSnapshotPure } from "./applySessionSnapshot.js"

/** night_action_result가 실어 나르는 개인 결과의 종류 — 이 둘 외에는 store에 들이지 않는다. */
const NIGHT_PRIVATE_RESULT_ACTION_TYPES = new Set(["INVESTIGATE", "CONFIRM"])

/**
 * state 패치가 "NIGHT로 새로 들어가는" 전이일 때만 개인 조사 결과를 함께 비운다.
 *
 * 이미 NIGHT인 상태의 갱신(night_turn_changed 등)은 대상이 아니다 — 그 밤에 방금 받은 결과를
 * 지워버리면 정작 화면에 뜨기 전에 사라진다(이 기능이 고치려는 바로 그 버그다).
 *
 * @param {object} current set() 콜백이 받은 현재 store
 * @param {object} patch 해당 액션이 반영하려는 패치(참조 보존 no-op이면 current 그 자체)
 * @flow no-op·NIGHT가 아닌 패치·이미 NIGHT였던 경우·이미 비어 있는 경우는 패치를 그대로 통과시킨다.
 */
function withNightReentryClear(current, patch) {
  if (patch === current) return current
  if (patch.state?.phase !== "NIGHT") return patch
  if (current.state?.phase === "NIGHT") return patch
  if (current.nightPrivateResult === null) return patch
  return { ...patch, nightPrivateResult: null }
}

/**
 * 서버 인게임 상태를 보관하는 클라이언트 store.
 * 도메인 판정은 서버 game-core가 담당하고, 프론트는 동기화된 상태를 렌더링만 합니다.
 *
 * Room→GameSession 전환(useMatchingRoom의 game_started 핸들러가 setGamePayload를 호출)은
 * 구현됐지만, 인게임 진입 후 실시간으로 state를 갱신하는 소켓 연결(useInGameSocket)은 아직
 * 없습니다 — 게임 시작 직후 받은 초기 state(ROLE_REVEAL 단계)에서 더 이상 갱신되지 않고,
 * 화면은 그 정적인 state 위에 프리뷰(더미) 데이터를 일부 섞어 렌더링됩니다.
 */
export const useInGameStore = create((set) => ({
  gameId: null,
  state: null,
  error: null,

  // game_started 직전 matchingStore의 hostUuid — GameSession payload에는 아직 없다.
  hostUuid: null,

  // get_session_snapshot 복원이 실제로 반영될 때마다 1씩 오르는 단조 카운터.
  // "이번 state 변화가 실시간 canonical 전이인가, 재접속 하이드레이션인가"를 구독자가
  // 소켓 리스너 등록 순서에 의존하지 않고 판별할 수 있게 하는 유일한 표식이다
  // (useInGamePhaseEntrance가 이 값으로 하이드레이션을 진입 연출에서 제외한다).
  // 하이드레이션이 거부되면(참조 보존 no-op) 이 값도 오르지 않는다.
  snapshotSeq: 0,

  // GUARD/WITCH_HUNTER 본인에게만 오는 1회성 개인 조사 결과(night_action_result).
  // state(서버 세션 미러) 안이 아니라 최상위에 둔다 — applySessionSnapshotPure가 state를 통째로
  // 새로 만들기 때문에 그 안에 두면 재접속 하이드레이션에서 조용히 사라진다. 이 값은
  // night_result_applied(DAY 전이)로는 절대 지워지지 않는다 — 지워지는 곳은 정확히 세 곳뿐이다:
  // 오버레이 확인(clearNightPrivateResult) · NIGHT 재진입(withNightReentryClear) · gameId 변경.
  nightPrivateResult: null,

  // 백엔드 buildGameStartedPayload는 alive를 보내지 않으므로(계약 불변) 스토어가 정규화
  // 시점에 기본값을 채운다 — 신규 세션은 항상 전원 생존 상태로 시작한다는 game-core의
  // assertValidSessionForCommit 불변조건과 대응한다.
  setGamePayload: ({ gameId, state, hostUuid }) =>
    set({
      gameId: gameId ?? state?.id ?? null,
      state: state
        ? { ...state, players: Array.isArray(state.players) ? state.players.map((p) => ({ ...p, alive: true })) : state.players }
        : null,
      hostUuid: typeof hostUuid === "string" && hostUuid.trim().length > 0 ? hostUuid : null,
      error: null,
      // 새 세션이므로 이전 게임의 개인 조사 결과는 넘어오지 않는다(요구 1의 clear 시점 (c)).
      nightPrivateResult: null,
    }),

  // night_action_result(본인에게만 오는 개인 조사 결과)를 보관한다. 호출부(useInGameResolveNight)가
  // 이미 gameId·dayIndex 단조성을 검사하지만, 다른 액션들과 같은 이유로 여기서도 독립적으로
  // 형태를 재검증한다 — 어긋나면 current를 그대로 돌려 완전한 no-op으로 만든다.
  // payload는 얕게 복사해 담는다(호출부가 이후 같은 객체를 손대도 store가 흔들리지 않게).
  setNightPrivateResult: (payload) =>
    set((current) => {
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return current
      if (typeof payload.gameId !== "string" || payload.gameId.trim().length === 0) return current
      if (!current.gameId || !current.state) return current
      if (payload.gameId !== current.gameId) return current
      if (!Number.isInteger(payload.dayIndex)) return current
      if (!NIGHT_PRIVATE_RESULT_ACTION_TYPES.has(payload.actionType)) return current
      if (typeof payload.targetId !== "string" || payload.targetId.length === 0) return current

      return { nightPrivateResult: { ...payload } }
    }),

  // 개인 조사 결과 오버레이의 확인 버튼이 부르는 유일한 소비 경로다(요구 1의 clear 시점 (a)).
  // 이미 비어 있으면 참조를 보존해 no-op으로 만든다.
  clearNightPrivateResult: () =>
    set((current) => (current.nightPrivateResult === null ? current : { nightPrivateResult: null })),

  // game_phase_changed 방송을 반영한다. payload는 신뢰하지 않는 외부 입력이므로 구조분해
  // 전에 형태부터 검증한다 — ROLE_REVEAL에서 나가는 canonical 전이와 정확히 일치할 때만
  // 반영하고, 그 외에는 store를 전혀 건드리지 않는다. set()에 넘긴 current를 그대로 돌려주면
  // zustand가 참조 변경 없이 완전한 no-op으로 처리한다(Object.is로 이전 state와 같은 참조인지
  // 비교해, 같으면 리스너조차 호출하지 않는다).
  //
  // 서버의 acknowledgeRoleReveal은 전원 확인이 끝나면 enterDayPhase로 첫 DAY(dayIndex 1)에
  // 진입한다 — 밤이 아니라 낮이 게임의 첫 진행 단계다(backend game-core/gameSession.js 참고).
  // 이 store는 그 canonical 전이를 그대로 비추기만 한다(판정은 하지 않는다).
  applyPhaseChanged: (payload) =>
    set((current) => {
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return current
      if (typeof payload.gameId !== "string" || payload.gameId.trim().length === 0) return current
      if (!current.gameId || !current.state) return current
      if (payload.gameId !== current.gameId) return current
      if (current.state.phase !== "ROLE_REVEAL") return current

      const isFirstDay = payload.phase === "DAY" && payload.dayIndex === 1
      const isLegacyFirstNight = payload.phase === "NIGHT" && payload.dayIndex === 0
      if (!isFirstDay && !isLegacyFirstNight) return current

      return withNightReentryClear(current, {
        state: { ...current.state, phase: payload.phase, dayIndex: payload.dayIndex },
      })
    }),

  // night_result_applied 방송을 반영한다. 호출부(useGameSessionSocketEvents)가 이미
  // parseNightResultAppliedPayload로 검증한 값만 넘기지만, applyPhaseChanged와 동일한 이유로
  // 여기서도 독립적으로 gameId/dayIndex 단조성을 재확인한다 — phase/dayIndex/players[].alive를
  // 하나의 set()으로 함께 반영해 중간 렌더에서 상태가 어긋나지 않게 한다.
  //
  // 이 액션은 nightPrivateResult를 절대 건드리지 않는다 — 그 밤의 개인 조사 결과는 DAY로
  // 넘어온 뒤에야 오버레이로 보여줄 틈이 생기므로, 여기서 지우면 영영 화면에 뜨지 못한다.
  applyNightResultAppliedPayload: (payload) =>
    set((current) => {
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return current
      if (typeof payload.gameId !== "string" || payload.gameId.trim().length === 0) return current
      if (!current.gameId || !current.state) return current
      if (payload.gameId !== current.gameId) return current
      // 이미 ENDED면 어떤 재요청·stale broadcast도 종료 상태를 되돌리지 않는다(멱등·불변).
      if (current.state.phase === "ENDED") return current

      // 승리 조건이 밤 사망 직후 확정되면 DAY 전이 없이 ENDED payload가 도착한다(dayIndex는
      // 증가하지 않고 그대로 유지될 수 있다) — parseNightResultAppliedPayload와 동일한 이유로
      // 아래 "phase !== 'DAY'" 분기보다 먼저 처리한다.
      if (payload.phase === "ENDED") {
        if (!Number.isInteger(payload.dayIndex)) return current
        if (!Array.isArray(payload.players)) return current
        if (payload.dayIndex < current.state.dayIndex) return current

        const aliveByUuid = new Map(payload.players.map((p) => [p.uuid, p.isAlive]))
        const nextPlayers = current.state.players.map((p) =>
          aliveByUuid.has(p.uuid) ? { ...p, alive: aliveByUuid.get(p.uuid) } : p,
        )

        return {
          state: {
            ...current.state,
            phase: "ENDED",
            dayIndex: payload.dayIndex,
            players: nextPlayers,
            ...(payload.winResult ? { winResult: payload.winResult } : {}),
          },
        }
      }

      if (payload.phase !== "DAY") return current
      if (!Number.isInteger(payload.dayIndex)) return current
      if (!Array.isArray(payload.players)) return current
      if (payload.dayIndex <= current.state.dayIndex) return current

      const aliveByUuid = new Map(payload.players.map((p) => [p.uuid, p.alive]))
      const nextPlayers = current.state.players.map((p) =>
        aliveByUuid.has(p.uuid) ? { ...p, alive: aliveByUuid.get(p.uuid) } : p,
      )

      return { state: { ...current.state, phase: payload.phase, dayIndex: payload.dayIndex, players: nextPlayers } }
    }),

  // day_vote_resolved 방송을 반영한다. TRIBUNAL 판정은 phase를 TRIBUNAL로 바꾸고
  // tribunal.defendantUuid를 채우며, TIE/ABSTAINED는 TRIBUNAL 없이 곧장 phase를 NIGHT로
  // 바꾼다(dayIndex는 그대로 — commitDayVoteResolution의 TIE/ABSTAINED→NIGHT 전이와 대응).
  // 호출부가 이미 파싱한 값만 넘기지만, applyNightResultAppliedPayload와 동일한 이유로 여기서도
  // 독립적으로 gameId/phase/dayIndex 일관성을 재확인한다.
  applyDayVoteResolvedToPhase: (gameId, dayIndex, { outcome, defendantUuid } = {}) =>
    set((current) => {
      if (typeof gameId !== "string" || gameId.trim().length === 0) return current
      if (!Number.isInteger(dayIndex)) return current
      if (!current.gameId || !current.state) return current
      if (gameId !== current.gameId) return current
      if (current.state.phase !== "DAY") return current
      if (dayIndex !== current.state.dayIndex) return current

      if (outcome === "TRIBUNAL") {
        if (typeof defendantUuid !== "string" || defendantUuid.length === 0) return current
        return { state: { ...current.state, phase: "TRIBUNAL", tribunal: { defendantUuid } } }
      }
      if (outcome === "TIE" || outcome === "ABSTAINED") {
        // 새 NIGHT의 시작 턴은 지난 밤의 nightTurnRole을 이어받지 않는다 — null로 되돌려
        // selectInGameNightTurnRole이 이 밤의 canonical 시작 턴(getInGameOpeningNightTurnRole)으로
        // 다시 떨어지게 한다(서버가 첫 턴을 별도로 방송하지 않으므로, 남겨두면 지난 밤 마지막
        // 역할이 이 밤에도 잘못 announceable할 수 있다).
        return withNightReentryClear(current, {
          state: { ...current.state, phase: "NIGHT", nightTurnRole: null },
        })
      }
      return current
    }),

  // night_turn_changed 방송을 반영한다. gameId/phase/dayIndex가 canonical과 일치할 때만
  // nightTurnRole을 갱신한다 — stale하거나 다른 게임/낮의 방송은 참조를 그대로 보존한다(no-op).
  applyNightTurnChanged: (payload) =>
    set((current) => {
      if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return current
      if (typeof payload.gameId !== "string" || payload.gameId.trim().length === 0) return current
      if (!current.gameId || !current.state) return current
      if (payload.gameId !== current.gameId) return current
      if (current.state.phase !== "NIGHT" || payload.phase !== "NIGHT") return current
      if (!Number.isInteger(payload.dayIndex) || payload.dayIndex !== current.state.dayIndex) return current
      if (payload.nightTurnRole !== null && typeof payload.nightTurnRole !== "string") return current
      if (current.state.nightTurnRole === payload.nightTurnRole) return current

      return { state: { ...current.state, nightTurnRole: payload.nightTurnRole } }
    }),

  // tribunal_vote_resolved 방송을 반영한다. 검증·staleness 판단은 순수 함수
  // applyTribunalResolvedPure에 전부 위임하고(store 참조 보존 no-op 포함), 여기서는 그 결과를
  // set()에 그대로 전달하기만 한다.
  // 이 판정은 TRIBUNAL→NIGHT 전이를 만들 수 있으므로 NIGHT 재진입 clear를 함께 통과시킨다.
  applyTribunalResolved: (payload) =>
    set((current) => withNightReentryClear(current, applyTribunalResolvedPure(current, payload))),

  // get_session_snapshot 재접속 응답을 반영한다. 검증·병합은 순수 함수 applySessionSnapshotPure에
  // 전부 위임하고(store 참조 보존 no-op 포함), 여기서는 실제로 반영된 경우에만 snapshotSeq를
  // 하나 올려 "이 변화는 실시간 전이가 아니라 하이드레이션"임을 구독자에게 알린다.
  applySessionSnapshot: (response) =>
    set((current) => {
      const patch = applySessionSnapshotPure(current, response)
      if (patch === current) return current
      // NIGHT으로 복원되는 하이드레이션도 "그 밤에 새로 들어간 것"으로 본다 — 서버는 개인
      // 조사 결과를 재전송하지 않으므로 프런트만으로 복구할 수 없고, 남겨두면 지난 밤 결과가
      // 새 밤에 뜬다.
      return { ...withNightReentryClear(current, patch), snapshotSeq: current.snapshotSeq + 1 }
    }),

  setGameError: (error) => set({ error }),

  clearGame: () =>
    set({ gameId: null, state: null, hostUuid: null, error: null, nightPrivateResult: null }),
}))

export const selectInGameState = (store) => store.state
