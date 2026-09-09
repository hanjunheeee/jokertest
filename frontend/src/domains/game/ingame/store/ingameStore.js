// 파일 역할: ingameStore.js - 전역 상태 store입니다.
import { create } from "zustand"
import { applyTribunalResolvedPure } from "./applyTribunalResolved.js"
import { applySessionSnapshotPure, bootstrapSessionSnapshotPure } from "./applySessionSnapshot.js"
import { getDayVoteRound, parseDayVoteRoundFields } from "../utils/dayVoteRound.js"

// 밤 역할 턴을 "아직 아무 턴도 방송되지 않음"으로 되돌리는 패치. 밤을 벗어나거나 새 밤에
// 들어갈 때마다 같은 두 필드를 함께 비우기 위해 한 곳에 모아둔다 — 한쪽만 비우면 역할과
// 남은 시간이 서로 다른 턴을 가리키게 된다.
const CLEARED_NIGHT_TURN = Object.freeze({ nightTurnRole: null, nightTurnDeadline: null })

// NIGHT에 새로 들어갈 때 개인 결과를 함께 비우는 패치. nightPrivateResult는 "지난 밤의 내
// 조사/확인/암살 통지"라, 새 밤이 시작되면 반드시 사라져야 한다(그러지 않으면 지난 밤 결과가
// 이번 밤 오버레이로 다시 뜬다). CLEARED_NIGHT_TURN과 같은 이유로 한 곳에 모아둔다.
const CLEARED_NIGHT_PRIVATE_RESULT = Object.freeze({ nightPrivateResult: null })

/**
 * "밤이 아니었다가 밤이 됐다"(NIGHT 재진입)일 때만 개인 결과를 비우는 패치를 돌려준다.
 *
 * 같은 NIGHT 안에서 반복 관측되는 이벤트(중복 방송)나 재접속 스냅샷 복원은 재진입이 아니다 —
 * 그런 경로로 값이 사라지면 아직 확인하지 않은 개인 결과가 조용히 유실된다. 그래서 판단
 * 기준은 오직 "직전 canonical phase가 NIGHT이 아니었는가" 하나다.
 */
function clearNightPrivateResultOnNightEntry(current) {
  return current.state?.phase === "NIGHT" ? null : CLEARED_NIGHT_PRIVATE_RESULT
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

  // 이 게임 세션의 방장 uuid. 서버 buildGameStartedPayload에는 아직 hostUuid가 없으므로,
  // game_started를 받은 useMatchingRoom이 그 시점 matchingStore의 hostUuid를 함께 넘겨준다.
  // gameId·state와 같은 set()에서만 채워지고 clearGame이 함께 비우므로, 방장 정보는 항상
  // "지금 이 세션"에만 묶인다 — 이전 방/이전 게임의 방장이 다음 세션으로 새지 않는다
  // (useInGameSettingIsHost 참고). 스냅샷 복원 경로는 이 값을 채우지 않는다(서버가 보내지
  // 않으므로 알 수 없다 → null → 방장 아님으로 fail-closed).
  hostUuid: null,

  // get_session_snapshot 복원이 실제로 반영될 때마다 1씩 오르는 단조 카운터.
  // "이번 state 변화가 실시간 canonical 전이인가, 재접속 하이드레이션인가"를 구독자가
  // 소켓 리스너 등록 순서에 의존하지 않고 판별할 수 있게 하는 유일한 표식이다
  // (useInGamePhaseEntrance가 이 값으로 하이드레이션을 진입 연출에서 제외한다).
  // 하이드레이션이 거부되면(참조 보존 no-op) 이 값도 오르지 않는다.
  snapshotSeq: 0,

  // 이 밤에 나에게만 온 개인 결과(night_action_result). state 안이 아니라 최상위에 두는 이유는
  // canonical 세션 상태가 아니기 때문이다 — 서버 스냅샷·방송이 실어 나르는 값이 아니라 이
  // 클라이언트 한 대가 받은 1회성 통지라, state를 통째로 교체하는 스냅샷 복원이 지나가도
  // 사라지면 안 된다(applySessionSnapshotPure는 state만 만든다).
  //
  // 비워지는 시점은 정확히 셋뿐이다:
  //   1. 오버레이 확인(clearNightPrivateResult)
  //   2. NIGHT 재진입(clearNightPrivateResultOnNightEntry — 새 밤이 시작될 때)
  //   3. gameId 변경(setGamePayload / clearGame / bootstrapSessionSnapshot)
  // night_result_applied나 같은 게임의 일반 스냅샷 적용으로는 절대 비우지 않는다.
  nightPrivateResult: null,

  // 백엔드 buildGameStartedPayload는 alive를 보내지 않으므로(계약 불변) 스토어가 정규화
  // 시점에 기본값을 채운다 — 신규 세션은 항상 전원 생존 상태로 시작한다는 game-core의
  // assertValidSessionForCommit 불변조건과 대응한다.
  //
  // players[].themeIndex(표시 색상)는 반대다 — 서버가 게임당 한 번 배정해 모든 참가자에게
  // 같은 값을 내려주므로 스토어는 정규화 없이 그대로 통과시키고(아래 {...p} 스프레드),
  // 값의 유효성은 소비 지점인 buildPlayerSessionSourceFromGameState가 fail-closed로 검증한다.
  //
  // hostUuid는 서버 payload가 아니라 호출부(useMatchingRoom)가 방 단계에서 알던 값을 얹어
  // 보내는 것이라 형태를 여기서 다시 검증한다 — 문자열이 아니거나 비어 있으면 null로 두어
  // "방장을 모른다"와 "방장이다"를 섞지 않는다.
  setGamePayload: ({ gameId, state, hostUuid }) =>
    set({
      gameId: gameId ?? state?.id ?? null,
      state: state
        ? { ...state, players: Array.isArray(state.players) ? state.players.map((p) => ({ ...p, alive: true })) : state.players }
        : null,
      hostUuid: typeof hostUuid === "string" && hostUuid.trim().length > 0 ? hostUuid : null,
      error: null,
      // 새 세션(gameId 변경)이다 — 이전 게임의 개인 결과가 넘어오지 않게 함께 비운다.
      ...CLEARED_NIGHT_PRIVATE_RESULT,
    }),

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

      // 낮은 항상 토론(DAY_DISCUSSION)부터 시작한다 — 서버 enterDayPhase가 DAY 진입 때마다
      // 하위 구간을 토론으로 초기화하는 것과 대응한다. dayPhase는 phase === "DAY"일 때만
      // 의미가 있으므로, 낮이 아닌 legacy first-night 경로에서는 null로 둔다.
      return {
        state: {
          ...current.state,
          phase: payload.phase,
          dayIndex: payload.dayIndex,
          dayPhase: isFirstDay ? "DAY_DISCUSSION" : null,
        },
        // 밤으로 들어가는 경로에서만 개인 결과를 비운다(ROLE_REVEAL에서는 이미 비어 있지만,
        // "NIGHT에 들어갈 때 비운다"는 규칙을 이 경로에도 똑같이 적용해 예외를 만들지 않는다).
        ...(isLegacyFirstNight ? CLEARED_NIGHT_PRIVATE_RESULT : {}),
      }
    }),

  // night_result_applied 방송을 반영한다. 호출부(useGameSessionSocketEvents)가 이미
  // parseNightResultAppliedPayload로 검증한 값만 넘기지만, applyPhaseChanged와 동일한 이유로
  // 여기서도 독립적으로 gameId/dayIndex 단조성을 재확인한다 — phase/dayIndex/players[].alive를
  // 하나의 set()으로 함께 반영해 중간 렌더에서 상태가 어긋나지 않게 한다.
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
            dayPhase: null, // 낮을 벗어났다 — dayPhase는 phase === "DAY"일 때만 의미가 있다.
            // 밤을 벗어났다 — 역할 턴은 phase === "NIGHT"일 때만 의미가 있다. 여기서 비우지
            // 않으면 지난 밤의 마지막 턴이 다음 밤으로 이월돼, 그 밤의 첫 turn 방송이 도착하기
            // 전에 엉뚱한 역할의 안내가 한 장 뜬다.
            ...CLEARED_NIGHT_TURN,
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

      // 새 낮은 항상 토론부터 시작한다(서버 enterDayPhase와 대응) — 지난 낮이 투표 중이었더라도
      // 이월되지 않는다.
      return {
        state: {
          ...current.state,
          phase: payload.phase,
          dayIndex: payload.dayIndex,
          dayPhase: "DAY_DISCUSSION",
          dayVoteRound: 1,
          dayVoteExcludedUuids: [],
          dayVoteResolution: null,
          // 밤을 벗어났다 — 위 ENDED 분기와 같은 이유로 역할 턴을 비운다.
          ...CLEARED_NIGHT_TURN,
          players: nextPlayers,
        },
      }
    }),

  // night_turn_started 방송(밤 안의 역할 턴 전이)을 반영한다. 호출부
  // (useGameSessionSocketEvents)가 이미 parseNightTurnStartedPayload로 검증한 값만 넘기지만,
  // 다른 apply* 액션과 동일한 이유로 여기서도 독립적으로 gameId/phase/dayIndex를 재확인한다.
  //
  // 여기 담기는 nightTurnRole이 곧 selectInGameNightTurnRole이 읽는 canonical 턴이다.
  // 이 값이 없는 구간에는 로컬 시작 역할을 추정하지 않고 다음 서버 방송을 기다린다.
  //
  // 생존 여부는 어디에서도 보지 않는다. 백엔드는 생존자가 없는 역할의 턴도 똑같이 돌리고
  // 똑같은 payload를 방송하므로(부채널 차단), 그 성질을 그대로 통과시켜야 죽은 역할의 턴에도
  // 모든 참가자 화면에 안내가 동일하게 뜬다.
  applyNightTurnStarted: (parsed) =>
    set((current) => {
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return current
      if (typeof parsed.gameId !== "string" || parsed.gameId.trim().length === 0) return current
      if (!current.gameId || !current.state) return current
      if (parsed.gameId !== current.gameId) return current
      // 역할 턴은 밤에만 의미가 있다. 서버는 NIGHT 전이 방송(day_vote_resolved 등)을 보낸
      // "뒤에" 턴 시퀀스를 시작하므로, 정상 경로에서 이 게이트에 걸리는 일은 없다 — 늦게
      // 도착한 이전 밤의 턴이 낮·재판 화면에 새어드는 것을 막는 방어다.
      if (current.state.phase !== "NIGHT") return current
      if (!Number.isInteger(parsed.dayIndex) || parsed.dayIndex !== current.state.dayIndex) return current
      if (typeof parsed.role !== "string" || parsed.role.length === 0) return current
      if (!Number.isFinite(parsed.deadline) || parsed.deadline <= 0) return current
      // 같은 턴의 중복 방송은 참조 보존 no-op — 안내는 canonical 턴이 실제로 바뀔 때만 열려야
      // 하므로, 같은 값의 재방송이 리렌더나 안내 재생을 만들지 않게 한다.
      if (current.state.nightTurnRole === parsed.role && current.state.nightTurnDeadline === parsed.deadline) {
        return current
      }

      return { state: { ...current.state, nightTurnRole: parsed.role, nightTurnDeadline: parsed.deadline } }
    }),

  // night_turn_ended는 서버가 현재 역할 턴을 끝냈다는 canonical 방송이다. 현재 턴과 정확히
  // 일치할 때만 role/deadline을 함께 비우고, 늦은 종료 방송은 참조 보존 no-op으로 버린다.
  applyNightTurnEnded: (parsed) =>
    set((current) => {
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return current
      if (typeof parsed.gameId !== "string" || parsed.gameId.trim().length === 0) return current
      if (!current.gameId || !current.state || parsed.gameId !== current.gameId) return current
      if (current.state.phase !== "NIGHT") return current
      if (!Number.isInteger(parsed.dayIndex) || parsed.dayIndex !== current.state.dayIndex) return current
      if (typeof parsed.role !== "string" || parsed.role !== current.state.nightTurnRole) return current

      return { state: { ...current.state, ...CLEARED_NIGHT_TURN } }
    }),

  // day_phase_changed 방송(낮 안의 DAY_DISCUSSION→DAY_VOTE 전이)을 반영한다. 호출부
  // (useGameSessionSocketEvents)가 이미 parseDayPhaseChangedPayload로 검증한 값만 넘기지만,
  // 다른 apply* 액션과 동일한 이유로 여기서도 독립적으로 gameId/phase/dayIndex를 재확인한다.
  // dayPhase는 phase === "DAY"일 때만 의미가 있으므로 낮이 아니면 어떤 경우에도 반영하지 않는다.
  applyDayPhaseChanged: (parsed) =>
    set((current) => {
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return current
      if (typeof parsed.gameId !== "string" || parsed.gameId.trim().length === 0) return current
      if (!current.gameId || !current.state) return current
      if (parsed.gameId !== current.gameId) return current
      if (current.state.phase !== "DAY") return current
      if (!Number.isInteger(parsed.dayIndex) || parsed.dayIndex !== current.state.dayIndex) return current
      if (parsed.dayPhase !== "DAY_VOTE") return current
      // 이미 투표가 열려 있으면 참조 보존 no-op — 재투표 라운드가 DAY_VOTE에 머무는 동안
      // 늦게 도착한 중복 방송이 불필요한 리렌더를 만들지 않게 한다.
      if (current.state.dayPhase === "DAY_VOTE") return current

      return { state: { ...current.state, dayPhase: "DAY_VOTE" } }
    }),

  // day_vote_resolved 방송을 반영한다. TRIBUNAL 판정은 phase를 TRIBUNAL로 바꾸고
  // tribunal.defendantUuid를 채우며, TIE/ABSTAINED는 TRIBUNAL 없이 곧장 phase를 NIGHT로
  // 바꾼다(dayIndex는 그대로 — commitDayVoteResolution의 TIE/ABSTAINED→NIGHT 전이와 대응).
  // 호출부가 이미 파싱한 값만 넘기지만, applyNightResultAppliedPayload와 동일한 이유로 여기서도
  // 독립적으로 gameId/phase/dayIndex/round 일관성을 재확인한다. REVOTE는 DAY에 남는다.
  applyDayVoteResolvedToPhase: (gameId, dayIndex, resolution = {}) =>
    set((current) => {
      const { outcome, defendantUuid, round = 1 } = resolution
      if (typeof gameId !== "string" || gameId.trim().length === 0) return current
      if (!Number.isInteger(dayIndex)) return current
      if (!current.gameId || !current.state) return current
      if (gameId !== current.gameId) return current
      if (current.state.phase !== "DAY") return current
      if (dayIndex !== current.state.dayIndex) return current
      if (round !== getDayVoteRound(current.state)) return current
      const rosterIds = new Set((current.state.players ?? []).map((p) => p.uuid))
      const roundFields = parseDayVoteRoundFields(resolution, rosterIds)
      if (!roundFields) return current
      const dayVoteResolution = {
        outcome,
        tribunalTargetUuid: outcome === "TRIBUNAL" ? defendantUuid : null,
        ...roundFields,
        publicVoteCount: resolution.publicVoteCount,
        publicAbstainCount: resolution.publicAbstainCount,
      }

      if (outcome === "REVOTE") {
        if (current.state.dayPhase !== "DAY_VOTE") return current
        return { state: {
          ...current.state,
          dayVoteRound: round + 1,
          dayVoteExcludedUuids: [...roundFields.revoteExcludedUuids],
          dayVoteResolution,
          tribunal: null,
          self: { ...current.state.self, hasActedThisPhase: false },
        } }
      }

      // 두 분기 모두 낮을 벗어나므로 dayPhase를 null로 되돌린다 — dayPhase는 phase === "DAY"일
      // 때만 의미가 있고, 다음 낮 진입 경로가 다시 DAY_DISCUSSION으로 세팅한다.
      if (outcome === "TRIBUNAL") {
        if (typeof defendantUuid !== "string" || defendantUuid.length === 0) return current
        return { state: { ...current.state, phase: "TRIBUNAL", dayPhase: null, dayVoteResolution, tribunal: { defendantUuid } } }
      }
      if (outcome === "TIE" || outcome === "ABSTAINED") {
        // 새 밤은 항상 "아직 어떤 턴도 방송되지 않은" 상태에서 시작한다. 첫
        // night_turn_started가 도착하기 전까지 role/deadline은 비어 있어야 한다.
        return {
          state: { ...current.state, phase: "NIGHT", dayPhase: null, dayVoteResolution, ...CLEARED_NIGHT_TURN },
          // NIGHT 재진입 — 지난 밤의 개인 결과는 이 밤으로 넘어오지 않는다.
          ...CLEARED_NIGHT_PRIVATE_RESULT,
        }
      }
      return current
    }),

  // tribunal_vote_resolved 방송을 반영한다. 검증·staleness 판단은 순수 함수
  // applyTribunalResolvedPure에 전부 위임하고(store 참조 보존 no-op 포함), 여기서는 그 결과를
  // set()에 그대로 전달하기만 한다.
  // 무죄·비종결 판정은 TRIBUNAL에서 곧장 NIGHT로 넘어간다 — 그 경로만 개인 결과를 함께
  // 비운다(참조 보존 no-op이나 ENDED 전이에서는 건드리지 않는다).
  applyTribunalResolved: (payload) =>
    set((current) => {
      const patch = applyTribunalResolvedPure(current, payload)
      if (patch === current) return current
      if (patch.state?.phase !== "NIGHT") return patch
      return { ...patch, ...clearNightPrivateResultOnNightEntry(current) }
    }),

  // get_session_snapshot 재접속 응답을 반영한다. 검증·병합은 순수 함수 applySessionSnapshotPure에
  // 전부 위임하고(store 참조 보존 no-op 포함), 여기서는 실제로 반영된 경우에만 snapshotSeq를
  // 하나 올려 "이 변화는 실시간 전이가 아니라 하이드레이션"임을 구독자에게 알린다.
  //
  // nightPrivateResult는 여기서 절대 건드리지 않는다 — applySessionSnapshotPure가 만드는 patch는
  // state(+snapshotSeq)뿐이고, 하이드레이션은 "새 밤에 들어갔다"가 아니라 "지금까지의 상태를
  // 다시 받았다"이므로 아직 확인하지 않은 개인 결과를 지울 근거가 되지 않는다.
  applySessionSnapshot: (response) =>
    set((current) => {
      const patch = applySessionSnapshotPure(current, response)
      if (patch === current) return current
      return { ...patch, snapshotSeq: current.snapshotSeq + 1 }
    }),

  // 브라우저 새로고침으로 메모리 store가 비었어도 인증된 서버의 현재 세션 스냅샷을 한 번에
  // 복원한다. 이미 게임 상태가 있으면 기존 신뢰 경계를 우회하지 않도록 반드시 no-op 한다.
  bootstrapSessionSnapshot: (response) =>
    set((current) => {
      if (current.gameId || current.state) return current
      const patch = bootstrapSessionSnapshotPure(response)
      if (!patch) return current
      // 빈 store에 gameId가 처음 붙는 경로다(gameId 변경) — 개인 결과도 이 세션 기준으로
      // 새로 시작한다. 어차피 비어 있지만, gameId가 바뀌는 모든 경로가 같은 규칙을 따르게 한다.
      return { ...patch, error: null, snapshotSeq: current.snapshotSeq + 1, ...CLEARED_NIGHT_PRIVATE_RESULT }
    }),

  // night_action_result를 반영한다. 형태·게임/밤 일치·본인 여부 검증은 호출부
  // (useGameSessionSocketEvents → parseInGameNightPrivateResultPayload)가 이미 끝냈지만,
  // 다른 apply* 액션과 동일한 이유로 여기서도 gameId 일치만은 독립적으로 재확인한다.
  setNightPrivateResult: (parsed) =>
    set((current) => {
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return current
      if (!current.gameId || parsed.gameId !== current.gameId) return current
      return { nightPrivateResult: parsed }
    }),

  // 오버레이 확인 — 개인 결과를 비우는 세 경로 중 하나다. 이미 비어 있으면 참조 보존 no-op이라
  // 확인 버튼의 중복 클릭이 불필요한 리렌더를 만들지 않는다.
  clearNightPrivateResult: () =>
    set((current) => (current.nightPrivateResult === null ? current : CLEARED_NIGHT_PRIVATE_RESULT)),

  setGameError: (error) => set({ error }),

  clearGame: () =>
    set({ gameId: null, state: null, hostUuid: null, error: null, ...CLEARED_NIGHT_PRIVATE_RESULT }),
}))

export const selectInGameState = (store) => store.state
