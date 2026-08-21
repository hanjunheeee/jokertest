import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../shared/socket/socketClient.js"
import {
  getInGameNightActionLabel,
  getInGameNightActionType,
  isSelfTargetAllowedForNightAction,
} from "../constants/actions/ingameActionPanel.js"
import { useInGameStore } from "../store/ingameStore.js"
import { useInGamePlayerSessionContext } from "../components/InGamePlayerSessionContext.js"
import { buildNightActionTargets } from "../utils/buildNightActionTargets.js"
import { buildDayVoteTargets, isSessionPlayerAlive } from "../utils/buildDayVoteTargets.js"
import { selectInGameNightTurnRole } from "../utils/selectInGameNightTurnRole.js"
import { useInGameNightActionSubmit } from "./useInGameNightActionSubmit.js"
import { useInGameDayVoteSubmit } from "./useInGameDayVoteSubmit.js"
import { useInGameTribunalVoteSubmit } from "./useInGameTribunalVoteSubmit.js"
import { useInGameResolveNight } from "./useInGameResolveNight.js"
import { useInGameTribunalVoteResolve } from "./useInGameTribunalVoteResolve.js"

const DAY_VOTE_RESOLVE_TIMEOUT_MS = 5000

/**
 * resolve_day_vote ack ?묐떟(?먮뒗 ?ㅽ뙣)???꾩갑?덉쓣 ??諛섏쁺???곹깭瑜?怨꾩궛?쒕떎(?쒖닔 ?⑥닔 ?? * computeResolveNightAckPatch? ?숈씪??怨꾩빟). ?깃났 ??'resolved'濡??좉렐?????먯젙? dayIndex?? * ??踰덈쭔 ?좏슚?섎?濡??ъ슂泥?쓣 ?덉슜?섏? ?딅뒗 ?뺤콉怨??쇱튂?쒕떎. ?ㅽ뙣 ??'idle'濡??섎룎???ъ떆?꾪븷
 * ???덇쾶 ?쒕떎.
 */
export function computeDayVoteResolveAckPatch(response) {
  if (response?.ok) {
    return {
      status: "resolved",
      error: null,
      resolution: { outcome: response.outcome ?? null, tribunalTargetUuid: response.tribunalTargetUuid ?? null },
    }
  }
  return { status: "idle", error: response?.message ?? "?먯젙?섏? 紐삵뻽?듬땲??", resolution: null }
}

/** day_vote_resolved 諛⑹넚???꾩옱 gameId(諛?吏????dayIndex)?????寃껋씤吏 ?뺤씤?쒕떎(?ㅻⅨ 寃뚯엫/?댁쟾 ??쓽 ??? 諛⑹넚??嫄몃윭?몃떎). */
export function shouldApplyDayVoteResolvedPayload({ payload, gameId, dayIndex }) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false
  if (!Number.isInteger(dayIndex)) return false
  if (payload.gameId !== gameId) return false
  if (payload.dayIndex !== dayIndex) return false
  return true
}

const DAY_VOTE_RESOLVED_OUTCOMES = new Set(["TRIBUNAL", "TIE", "ABSTAINED"])
// TIE/ABSTAINED는 TRIBUNAL 없이 곧장 그날 밤(NIGHT)으로 전이하므로(dayIndex는 그대로) phase는
// NIGHT여야 한다 — DAY로 남는 경우는 없다(commitDayVoteResolution 참고).
const DAY_VOTE_RESOLVED_PHASES = new Set(["NIGHT", "TRIBUNAL"])

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0
}

/** day_vote_resolved payload를 검증해 안전하게 소비 가능한 형태로 파싱한다. gameId/dayIndex가 활성
 * 값과 정확히 일치하고 phase/outcome/tribunalTargetUuid/집계값이 서로 일관될 때만 값을 반환하며,
 * 그 외에는 null을 반환해 listener가 stale하거나 계약을 어긴 방송을 무시하게 한다. */
export function parseDayVoteResolvedPayload({ payload, gameId, dayIndex }) {
  if (!shouldApplyDayVoteResolvedPayload({ payload, gameId, dayIndex })) return null
  if (!DAY_VOTE_RESOLVED_PHASES.has(payload.phase)) return null
  if (!DAY_VOTE_RESOLVED_OUTCOMES.has(payload.outcome)) return null
  if (!isNonNegativeInteger(payload.publicVoteCount)) return null
  if (!isNonNegativeInteger(payload.publicAbstainCount)) return null
  if (payload.publicAbstainCount > payload.publicVoteCount) return null

  if (payload.outcome === "TRIBUNAL") {
    if (payload.phase !== "TRIBUNAL") return null
    if (typeof payload.tribunalTargetUuid !== "string" || payload.tribunalTargetUuid.length === 0) return null
    if (payload.publicVoteCount <= payload.publicAbstainCount) return null
  } else if (payload.outcome === "TIE") {
    if (payload.phase !== "NIGHT") return null
    if (payload.tribunalTargetUuid !== null) return null
    if (payload.publicVoteCount <= payload.publicAbstainCount) return null
  } else {
    // ABSTAINED
    if (payload.phase !== "NIGHT") return null
    if (payload.tribunalTargetUuid !== null) return null
    if (payload.publicVoteCount !== payload.publicAbstainCount) return null
  }

  return {
    gameId: payload.gameId,
    dayIndex: payload.dayIndex,
    phase: payload.phase,
    outcome: payload.outcome,
    tribunalTargetUuid: payload.outcome === "TRIBUNAL" ? payload.tribunalTargetUuid : null,
    publicVoteCount: payload.publicVoteCount,
    publicAbstainCount: payload.publicAbstainCount,
  }
}

/** unmount/disconnect/gameId 蹂寃????섎룎由??곹깭瑜?怨꾩궛?쒕떎. unmounted硫?null(state瑜?嫄대뱶由ъ? ?딆쓬). */
export function computeDayVoteResolveInvalidatePatch(mounted) {
  if (!mounted) return null
  return { status: "idle", error: null, resolution: null }
}

/** 媛쒕컻???멸쾶??議곗옉 ?⑤꼸???좏깮媛믨낵 ?뚯폆 ?대깽???꾩넚??愿由ы빀?덈떎. */
export function useInGameActionPanel({ interactionBlocked = false } = {}) {
  const gameId = useInGameStore((s) => s.gameId)
  const gameState = useInGameStore((s) => s.state)
  const error = useInGameStore((s) => s.error)

  // NIGHT ??곸쑝濡??좏깮???뚮젅?댁뼱 id?낅땲??DAY ?ы몴 ?좏깮怨쇰뒗 蹂꾧컻 ?곹깭 ???쒕줈 ?ㅼ뿼?섏?
  // ?딅룄濡?遺꾨━?섏뼱 ?덉뒿?덈떎).
  const [selectedNightTargetId, setSelectedNightTargetId] = useState(null)
  // DAY ?ы몴 ??곸쑝濡??좏깮???뚮젅?댁뼱 id?낅땲??
  const [selectedDayVoteTargetId, setSelectedDayVoteTargetId] = useState(null)

  const myRole = gameState?.self?.role
  const dayIndex = gameState?.dayIndex

  // ??寃뚯엫 ?먮뒗 ?ㅼ쓬 dayIndex濡??꾪솚?섎㈃ ?댁쟾 DAY???좏깮媛믪씠 ??而⑦뀓?ㅽ듃濡??덉뼱?섍?吏
  // ?딄쾶 ?좏깮留?珥덇린?뷀빀?덈떎(?쒖텧 ?곹깭 由ъ뀑? useInGameDayVoteSubmit??controller媛 ?대떦).
  useEffect(() => {
    setSelectedDayVoteTargetId(null)
  }, [gameId, dayIndex])

  // NIGHT ????좏깮 紐⑸줉?낅땲?? gameState.players({uuid,nickname})瑜?InGameTargetPicker??  // 吏곸젒 ?섍린硫????⑸땲????洹?而댄룷?뚰듃??{id,name,alive,connected}瑜?湲곕??섎?濡???긽
  // "?곌껐?딄?"?쇰줈 鍮꾪솢?깊솕?⑸땲??id/name/alive/connected媛 ?꾨? undefined). 蹂대뱶쨌梨꾪똿쨌
  // ?ы몴?꾪솴 ???ㅻⅨ ?붾㈃怨??숈씪?섍쾶 useInGamePlayerSessionContext()媛 ?대? 蹂?섑빐 ??  // {id,nickname,status}瑜??ъ궗?⑺빐 ?대뙌??buildNightActionTargets)濡??뺥깭留?留욎땅?덈떎 ??  // ??alive ?쒖뒪?쒖씠 ?꾨땲??湲곗〈 status 怨꾩궛???ъ궗?⑺븯??寃껋엯?덈떎.
  const { players: sessionPlayers, localPlayerId } = useInGamePlayerSessionContext()
  const nightActionTargets = useMemo(
    () =>
      buildNightActionTargets(sessionPlayers, {
        localPlayerId,
        selfTargetAllowed: isSelfTargetAllowedForNightAction(myRole),
      }),
    [sessionPlayers, localPlayerId, myRole],
  )

  // DAY ?ы몴 ???紐⑸줉?낅땲????buildNightActionTargets? ?щ━ role/isAlly瑜??쎌? ?딆쑝誘濡?  // ?댁븘?덈뒗 ?숇즺 JOKER????긽 ?좏깮 媛?ν븳 ??곸쑝濡??⑥뒿?덈떎.
  const dayVoteTargets = useMemo(
    () => buildDayVoteTargets(sessionPlayers, { localPlayerId }),
    [sessionPlayers, localPlayerId],
  )
  const localSessionPlayer = sessionPlayers?.find((player) => player.id === localPlayerId)

  const latestEvents = useMemo(
    () => [...(gameState?.events ?? [])].slice(-6).reverse(),
    [gameState?.events],
  )

  const nightActionType = getInGameNightActionType(myRole, dayIndex)
  const nightActionLabel = getInGameNightActionLabel(myRole, dayIndex)
  const hasTarget = Boolean(selectedNightTargetId)

  // 지금 canonical하게 어느 역할의 NIGHT 턴인지는 오직 이 selector로만 읽는다(서버가 명시하면
  // 그 값, 아니면 이 밤의 시작 턴) — 프런트에는 이 값을 앞으로 밀 수 있는 별도 커서가 없다.
  const nightTurnRole = selectInGameNightTurnRole(gameState ?? null)
  const isNightActionTurn = gameState?.phase === "NIGHT" && typeof myRole === "string" && myRole === nightTurnRole

  const nightActionSubmit = useInGameNightActionSubmit()
  const dayVoteSubmit = useInGameDayVoteSubmit()
  const resolveNightRequest = useInGameResolveNight()

  // resolve_day_vote ?붿껌 ?곹깭 癒몄떊. useInGameResolveNight怨??숈씪????? ?묐떟 諛⑹뼱 ?⑦꽩
  // (mounted ref, generation versionRef, requestSocket identity + connected, gameId ?쇱튂)??  // ?ъ궗?⑺븯吏留? ?????먯껜媛 useInGameActionPanel.js 諛뽰쑝濡?遺꾨━???덉? ?딆쑝誘濡??몃씪?몄쑝濡?  // ?붾떎. day_vote_resolved(怨듦컻 諛⑹넚)瑜?援щ룆???ㅻⅨ 李멸??먭? 癒쇱? ?먯젙???앸궦 寃쎌슦?먮룄 ??  // ?대씪?댁뼵?몄쓽 ?낅젰???④퍡 ?좉렐??
  const dayVoteResolveSocket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)
  const [dayVoteResolveStatus, setDayVoteResolveStatus] = useState("idle") // idle | resolving | resolved
  const [dayVoteResolveError, setDayVoteResolveError] = useState(null)
  const [dayVoteResolution, setDayVoteResolution] = useState(null) // { outcome, tribunalTargetUuid } | null
  const dayVoteAckingRef = useRef(false)
  const dayVoteVersionRef = useRef(0)
  const dayVoteMountedRef = useRef(true)

  useEffect(() => {
    dayVoteMountedRef.current = true
    return () => {
      dayVoteMountedRef.current = false
    }
  }, [])

  const invalidateDayVoteResolve = () => {
    dayVoteVersionRef.current += 1
    dayVoteAckingRef.current = false
    const patch = computeDayVoteResolveInvalidatePatch(dayVoteMountedRef.current)
    if (!patch) return
    setDayVoteResolveStatus(patch.status)
    setDayVoteResolveError(patch.error)
    setDayVoteResolution(patch.resolution)
  }

  useEffect(() => {
    if (!dayVoteResolveSocket) return
    const handleDisconnect = () => invalidateDayVoteResolve()
    dayVoteResolveSocket.on("disconnect", handleDisconnect)
    return () => {
      dayVoteResolveSocket.off("disconnect", handleDisconnect)
      invalidateDayVoteResolve()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayVoteResolveSocket])

  // ??寃뚯엫 ?먮뒗 ?ㅼ쓬 dayIndex濡??꾪솚?섎㈃ ?댁쟾 ??쓽 ?먯젙 ?붿껌 ?곹깭쨌寃곌낵媛 ??而⑦뀓?ㅽ듃濡?  // ?덉뼱?섍?吏 ?딄쾶 珥덇린?뷀븳???좏깮媛?珥덇린?붿? ?숈씪???댁쑀??蹂꾨룄 effect).
  useEffect(() => {
    invalidateDayVoteResolve()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, dayIndex])

  useEffect(() => {
    if (!dayVoteResolveSocket || !gameId) return
    const handleDayVoteResolved = (payload) => {
      const parsed = parseDayVoteResolvedPayload({ payload, gameId, dayIndex })
      if (!parsed) return
      dayVoteVersionRef.current += 1
      dayVoteAckingRef.current = false
      if (!dayVoteMountedRef.current) return
      setDayVoteResolveStatus("resolved")
      setDayVoteResolveError(null)
      setDayVoteResolution({ outcome: parsed.outcome, tribunalTargetUuid: parsed.tribunalTargetUuid })
    }
    dayVoteResolveSocket.on("day_vote_resolved", handleDayVoteResolved)
    return () => {
      dayVoteResolveSocket.off("day_vote_resolved", handleDayVoteResolved)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayVoteResolveSocket, gameId, dayIndex])

  // ?먯젙??吏꾪뻾 以묒씠嫄곕굹 ?대? ?앸궗?쇰㈃(?ㅻⅨ 李멸??먭? 癒쇱? ?앸궦 寃쎌슦 ?ы븿) ?ы몴쨌湲곌텒쨌?먯젙 ?붿껌
  // ?낅젰???④퍡 ?좉렐????nightActionsLocked? ?숈씪???먯튃?대떎.
  // 게임이 ENDED로 전이되면 어떤 액션 컨트롤도 활성화되지 않는다(승리 확정 이후 모든 제출·판정
  // 요청을 UI 단에서부터 막는다). 아래 각 controlsEnabled/Locked 계산은 phase 정확 일치 검사
  // 덕분에 이미 자연히 잠기지만, 의도를 명시적으로 드러내고 향후 컨트롤 추가에도 회귀하지 않게
  // 이 플래그로 강제한다.
  const isGameEnded = gameState?.phase === "ENDED"

  const dayVoteResolveLocked = dayVoteResolveStatus !== "idle" || interactionBlocked
  const dayVoteControlsEnabled =
    !interactionBlocked &&
    !isGameEnded &&
    gameState?.phase === "DAY" &&
    isSessionPlayerAlive(localSessionPlayer) &&
    !dayVoteResolveLocked
  // ?먯젙??吏꾪뻾 以묒씠嫄곕굹(resolving) ?대? ?앸궗?쇰㈃(resolved) 諛??됰룞 ?낅젰쨌?먯젙 踰꾪듉???④퍡
  // ?좉렐?????먯젙 ?꾨즺 ???ъ젣異쑣룹쨷蹂??먯젙 ?붿껌??留됯린 ?꾪븿?대떎. phase !== 'NIGHT'???④퍡
  // 寃?ы븳????DAY ?꾩씠濡?resolveNightStatus媛 'idle'濡?珥덇린?붾릺?붾씪??NIGHT 議곗옉? 怨꾩냽
  // ?좉꺼 ?덉뼱???쒕떎.
  const nightActionsLocked =
    interactionBlocked || isGameEnded || resolveNightRequest.status !== "idle" || gameState?.phase !== "NIGHT"

  // NIGHT 행동 확정/건너뛰기 버튼 자체의 활성화 조건입니다(요구사항: 연결돼 있고 생존한 로컬
  // 참가자이면서 그 역할이 canonical 현재 NIGHT 턴과 같을 때만 활성화). nightActionsLocked(위,
  // phase·게임 종료·판정 진행 상태만 본다)와 별개로 결합해, 자기 턴이 아니면 그 자체로도
  // 잠긴다 — 서버가 이미 독립적으로 재검증하지만(NIGHT_TURN_ROLE_MISMATCH), 클라이언트가 애초에
  // 자기 턴이 아닌 제출 시도를 보여주지 않는다.
  const nightActionControlsEnabled =
    !nightActionsLocked &&
    isNightActionTurn &&
    isSessionPlayerAlive(localSessionPlayer) &&
    Boolean(getSocket()?.connected)

  const submitDayVote = () => {
    if (!selectedDayVoteTargetId) return
    dayVoteSubmit.submitDayVote(selectedDayVoteTargetId)
  }

  const abstainDayVote = () => {
    dayVoteSubmit.submitDayVote(null)
  }

  const resolveDayVote = () => {
    if (dayVoteAckingRef.current || dayVoteResolveStatus !== "idle") return
    const requestSocket = getSocket()
    if (!requestSocket || !requestSocket.connected) {
      setDayVoteResolveError("서버 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.")
      return
    }
    if (!gameId || !Number.isInteger(dayIndex)) return

    dayVoteVersionRef.current += 1
    const requestVersion = dayVoteVersionRef.current
    const requestGameId = gameId
    const requestDayIndex = dayIndex

    dayVoteAckingRef.current = true
    setDayVoteResolveStatus("resolving")
    setDayVoteResolveError(null)

    const isStale = () =>
      !dayVoteMountedRef.current ||
      requestVersion !== dayVoteVersionRef.current ||
      requestSocket !== getSocket() ||
      !requestSocket.connected ||
      requestGameId !== useInGameStore.getState().gameId

    requestSocket
      .timeout(DAY_VOTE_RESOLVE_TIMEOUT_MS)
      .emitWithAck("resolve_day_vote", { gameId: requestGameId, dayIndex: requestDayIndex })
      .then((response) => {
        if (isStale()) return
        const patch = computeDayVoteResolveAckPatch(response)
        setDayVoteResolveStatus(patch.status)
        setDayVoteResolveError(patch.error)
        setDayVoteResolution(patch.resolution)
      })
      .catch(() => {
        if (!isStale()) {
          setDayVoteResolveStatus("idle")
          setDayVoteResolveError("요청이 응답하지 않습니다. 다시 시도해주세요.")
        }
      })
      .finally(() => {
        if (requestVersion === dayVoteVersionRef.current) {
          dayVoteAckingRef.current = false
        }
      })
  }

  const tribunalVoteSubmit = useInGameTribunalVoteSubmit()

  const tribunalResolveRequest = useInGameTribunalVoteResolve()

  // dayVoteControlsEnabled와 동일한 원칙(단일 플래그로 잠금)이지만 소켓 connected까지 명시적으로
  // 요구한다 — 끊긴 소켓에 emitWithAck를 시도하면 controller가 아예 submit을 no-op 처리하므로,
  // 그 전에 버튼 자체를 잠가 사용자에게 헛제출 시도를 보이지 않게 한다.
  // 이 클라이언트가 직접 요청 중이거나(resolving) 이미 스스로 판정을 끝냈거나(resolved), 다른
  // 참가자가 먼저 끝내 canonical store에 반영된 경우(gameState.tribunal.resolved) 모두
  // 투표·판정 UI를 함께 잠근다.
  const tribunalResolveLocked =
    interactionBlocked || tribunalResolveRequest.status !== "idle" || gameState?.tribunal?.resolved === true

  const tribunalVoteControlsEnabled =
    !interactionBlocked &&
    !isGameEnded &&
    Boolean(gameState) &&
    typeof gameId === "string" &&
    Number.isInteger(dayIndex) &&
    gameState?.phase === "TRIBUNAL" &&
    !tribunalVoteSubmit.isDefendant &&
    tribunalVoteSubmit.alive &&
    tribunalVoteSubmit.status === "idle" &&
    !tribunalResolveLocked &&
    Boolean(getSocket()?.connected)

  const resolveTribunalVote = () => {
    tribunalResolveRequest.resolveTribunalVote()
  }

  const tribunalResolveControlsEnabled =
    !interactionBlocked &&
    !isGameEnded &&
    Boolean(gameState) &&
    typeof gameId === "string" &&
    Number.isInteger(dayIndex) &&
    gameState?.phase === "TRIBUNAL" &&
    !tribunalResolveLocked &&
    Boolean(getSocket()?.connected)

  const submitNightAction = () => {
    nightActionSubmit.submit(selectedNightTargetId ?? null)
  }

  const skipNightAction = () => {
    nightActionSubmit.submit(null)
  }

  return {
    gameState,
    error,
    interactionBlocked,
    selectedNightTargetId,
    setSelectedNightTargetId,
    nightActionTargets,
    latestEvents,
    nightActionType,
    nightActionLabel,
    hasTarget,
    nightActionStatus: nightActionSubmit.status,
    nightActionError: nightActionSubmit.error,
    selectedDayVoteTargetId,
    setSelectedDayVoteTargetId,
    dayVoteTargets,
    dayVoteControlsEnabled,
    submitDayVote,
    abstainDayVote,
    dayVoteStatus: dayVoteSubmit.status,
    dayVoteError: dayVoteSubmit.error,
    dayVoteHasSubmitted: dayVoteSubmit.hasSubmitted,
    dayVoteLastSubmittedTargetId: dayVoteSubmit.lastSubmittedTargetId,
    resolveDayVote,
    dayVoteResolveStatus,
    dayVoteResolveError,
    dayVoteResolution,
    dayVoteResolveLocked,
    submitTribunalVote: tribunalVoteSubmit.submitTribunalVote,
    tribunalVoteStatus: tribunalVoteSubmit.status,
    tribunalVoteError: tribunalVoteSubmit.error,
    tribunalVoteSubmittedVote: tribunalVoteSubmit.submittedVote,
    tribunalVoteIsDefendant: tribunalVoteSubmit.isDefendant,
    tribunalVoteAlive: tribunalVoteSubmit.alive,
    tribunalVoteControlsEnabled,
    resolveTribunalVote,
    tribunalResolveStatus: tribunalResolveRequest.status,
    tribunalResolveError: tribunalResolveRequest.error,
    tribunalResolveOutcome: gameState?.tribunal?.outcome ?? tribunalResolveRequest.outcome,
    tribunalResolveCounts: gameState?.tribunal?.counts ?? tribunalResolveRequest.counts,
    tribunalResolveExecutedUuid: gameState?.tribunal?.executedUuid ?? tribunalResolveRequest.executedUuid,
    tribunalResolveLocked,
    tribunalResolveControlsEnabled,
    submitNightAction,
    skipNightAction,
    nightActionsLocked,
    nightActionControlsEnabled,
    resolveNight: resolveNightRequest.resolveNight,
    resolveNightStatus: resolveNightRequest.status,
    resolveNightError: resolveNightRequest.error,
  }
}
