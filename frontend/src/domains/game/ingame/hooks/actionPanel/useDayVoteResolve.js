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
  NO_ACK_MSG,
  OFFLINE_MSG,
  TIMEOUT_MS,
} from "../../constants/actions/dayVoteResolve.js"
import { onDisconnect } from "../../socket/connection.js"
import { emitResolveDayVote, onDayVoteResolved } from "../../socket/day.js"

// 낮 투표 판정 상태 훅
// open = 판정 버튼 열 단계인지 (조작 막힘·판 끝·낮 투표는 부르는 쪽이 계산)
export function useDayVoteResolve({ gameId, dayIndex, dayVoteRound, open }) {
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)
  const [status, setStatus] = useState("idle")
  const [error, setError] = useState(null)
  const [resolution, setResolution] = useState(null)
  const ackingRef = useRef(false)
  const versionRef = useRef(0)
  const mountedRef = useRef(true)

  // 내려간 뒤 상태 바꾸기 막기용 표시
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
  }, [socket])

  // 판·날짜·회차가 바뀌면 무효화
  useEffect(() => {
    invalidate()
  }, [gameId, dayIndex, dayVoteRound])

  // 다른 사람이 판정해도 방송으로 결과를 받음 (그 회차 것만)
  useEffect(() => {
    if (!socket || !gameId) return
    const handleDayVoteResolved = (payload) => {
      const parsed = parseDayVoteResolvedPayload({ payload, gameId, dayIndex })
      if (!parsed) return
      if ((parsed.round ?? 1) !== dayVoteRound) return
      // 내 요청이 진행 중이어도 방송 결과가 우선, 재투표면 다시 누를 수 있게 idle로 둠
      versionRef.current += 1
      ackingRef.current = false
      if (!mountedRef.current) return
      setStatus(parsed.outcome === "REVOTE" ? "idle" : "resolved")
      setError(null)
      setResolution({ outcome: parsed.outcome, tribunalTargetUuid: parsed.tribunalTargetUuid })
    }
    return onDayVoteResolved(socket, handleDayVoteResolved)
  }, [socket, gameId, dayIndex, dayVoteRound])

  const controlsEnabled = open && status === "idle"

  // 판정 요청 (응답이 늦게 와도 판·날짜·회차·연결이 그대로일 때만 반영)
  const resolve = () => {
    // 못 누르는 때·보내는 중이면 막기, 연결 없으면 오류 문구
    if (!controlsEnabled) return
    if (ackingRef.current || status !== "idle") return
    const requestSocket = getSocket()
    if (!requestSocket || !requestSocket.connected) {
      setError(OFFLINE_MSG)
      return
    }
    if (!gameId || !Number.isInteger(dayIndex)) return

    // 요청 때 세대·판·날짜·회차를 잡아 둠
    versionRef.current += 1
    const requestVersion = versionRef.current
    const requestGameId = gameId
    const requestDayIndex = dayIndex
    const requestRound = dayVoteRound

    ackingRef.current = true
    setStatus("resolving")
    setError(null)

    // 화면·세대·소켓·연결·판·날짜·회차 중 하나라도 바뀌었으면 옛 응답
    const isStale = () =>
      !mountedRef.current ||
      requestVersion !== versionRef.current ||
      requestSocket !== getSocket() ||
      !requestSocket.connected ||
      requestGameId !== useInGameStore.getState().gameId ||
      requestDayIndex !== useInGameStore.getState().state?.dayIndex ||
      requestRound !== getDayVoteRound(useInGameStore.getState().state)

    emitResolveDayVote(requestSocket, TIMEOUT_MS, requestGameId, requestDayIndex)
      .then((response) => {
        if (isStale()) return
        const patch = computeDayVoteResolveAckPatch(response)
        setStatus(patch.status)
        setError(patch.error)
        setResolution(patch.resolution)
      })
      // 응답 없음(시간 초과 포함)이면 다시 누를 수 있게 둠
      .catch(() => {
        if (!isStale()) {
          setStatus("idle")
          setError(NO_ACK_MSG)
        }
      })
      // 그사이 새 세대가 안 생겼을 때만 보내는 중 표시 풂
      .finally(() => {
        if (requestVersion === versionRef.current) {
          ackingRef.current = false
        }
      })
  }

  return { status, error, resolution, controlsEnabled, resolve }
}
