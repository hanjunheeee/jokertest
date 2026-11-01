// 낮 투표 판정 요청 훅: 판정 요청 보내기·판정 방송 받기·끊김/단계 바뀜에 무효화
// 행동 패널(useInGameActionPanel)이 낮 투표 판정 버튼 상태로 씀
import { useEffect, useRef, useState, useSyncExternalStore } from "react"
import { getSocket, subscribeSocket } from "../../../../../shared/socket/socketClient.js"
import { useInGameStore } from "../../store/ingameStore.js"
import { getDayVoteRound } from "../../utils/dayVoteRound.js"
import {
  computeDayVoteResolveAckPatch,
  computeDayVoteResolveInvalidatePatch,
  parseDayVoteResolvedPayload,
} from "../../utils/dayVoteResolve.js"
import {
  DAY_VOTE_RESOLVE_NO_ACK_MESSAGE,
  DAY_VOTE_RESOLVE_OFFLINE_MESSAGE,
  DAY_VOTE_RESOLVE_TIMEOUT_MS,
} from "../../constants/actions/dayVoteResolve.js"
import { onDisconnect } from "../../socket/connection.js"
import { emitResolveDayVote, onDayVoteResolved } from "../../socket/day.js"

// open: 판정 버튼을 열 수 있는 단계인지 (조작 막힘·판 끝·낮 투표 단계는 부르는 쪽이 계산)
export function useDayVoteResolve({ gameId, dayIndex, dayVoteRound, open }) {
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)
  const [status, setStatus] = useState("idle")
  const [error, setError] = useState(null)
  const [resolution, setResolution] = useState(null)
  const ackingRef = useRef(false)
  const versionRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // 진행 중 요청 버리기 (세대 올림), 화면이 살아 있으면 상태도 비움
  const invalidate = () => {
    versionRef.current += 1
    ackingRef.current = false
    const patch = computeDayVoteResolveInvalidatePatch(mountedRef.current)
    if (!patch) return
    setStatus(patch.status)
    setError(patch.error)
    setResolution(patch.resolution)
  }

  // 끊기거나 소켓이 바뀌면 무효화
  useEffect(() => {
    if (!socket) return
    const off = onDisconnect(socket, () => invalidate())
    return () => {
      off()
      invalidate()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket])

  // 판·날짜·회차가 바뀌면 무효화
  useEffect(() => {
    invalidate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, dayIndex, dayVoteRound])

  // 다른 사람이 판정해도 방송으로 결과를 받음 (그 회차 것만)
  useEffect(() => {
    if (!socket || !gameId) return
    const handleDayVoteResolved = (payload) => {
      const parsed = parseDayVoteResolvedPayload({ payload, gameId, dayIndex })
      if (!parsed) return
      if ((parsed.round ?? 1) !== dayVoteRound) return
      versionRef.current += 1
      ackingRef.current = false
      if (!mountedRef.current) return
      setStatus(parsed.outcome === "REVOTE" ? "idle" : "resolved")
      setError(null)
      setResolution({ outcome: parsed.outcome, tribunalTargetUuid: parsed.tribunalTargetUuid })
    }
    return onDayVoteResolved(socket, handleDayVoteResolved)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, gameId, dayIndex, dayVoteRound])

  const controlsEnabled = open && status === "idle"

  // 판정 요청 (응답이 늦게 와도 판·날짜·회차·연결이 그대로일 때만 반영)
  const resolve = () => {
    if (!controlsEnabled) return
    if (ackingRef.current || status !== "idle") return
    const requestSocket = getSocket()
    if (!requestSocket || !requestSocket.connected) {
      setError(DAY_VOTE_RESOLVE_OFFLINE_MESSAGE)
      return
    }
    if (!gameId || !Number.isInteger(dayIndex)) return

    versionRef.current += 1
    const requestVersion = versionRef.current
    const requestGameId = gameId
    const requestDayIndex = dayIndex
    const requestRound = dayVoteRound

    ackingRef.current = true
    setStatus("resolving")
    setError(null)

    const isStale = () =>
      !mountedRef.current ||
      requestVersion !== versionRef.current ||
      requestSocket !== getSocket() ||
      !requestSocket.connected ||
      requestGameId !== useInGameStore.getState().gameId ||
      requestDayIndex !== useInGameStore.getState().state?.dayIndex ||
      requestRound !== getDayVoteRound(useInGameStore.getState().state)

    emitResolveDayVote(requestSocket, DAY_VOTE_RESOLVE_TIMEOUT_MS, requestGameId, requestDayIndex)
      .then((response) => {
        if (isStale()) return
        const patch = computeDayVoteResolveAckPatch(response)
        setStatus(patch.status)
        setError(patch.error)
        setResolution(patch.resolution)
      })
      .catch(() => {
        if (!isStale()) {
          setStatus("idle")
          setError(DAY_VOTE_RESOLVE_NO_ACK_MESSAGE)
        }
      })
      .finally(() => {
        if (requestVersion === versionRef.current) {
          ackingRef.current = false
        }
      })
  }

  return { status, error, resolution, controlsEnabled, resolve }
}
