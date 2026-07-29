import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { getSocket } from "@/shared/socket/socketClient.js"
import {
  CREATE_ROOM_ERROR_MESSAGES,
  CREATE_ROOM_TIMEOUT_MS,
  CURRENT_ROOM_MAX_POLL_ATTEMPTS,
  CURRENT_ROOM_POLL_INTERVAL_MS,
  CURRENT_ROOM_TIMEOUT_MS,
  SOCKET_EVENTS,
} from "../constants/gameSetupSocket.js"

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * 게임 만들기 페이지의 입장 애니메이션, 방 생성 요청(ack), ack 유실 복구, 대기방 이동을 관리합니다.
 * Socket 요청/응답 처리와 navigation은 전부 여기서 담당하고, 컴포넌트는 이 훅이 반환하는
 * 값만 그린다(컴포넌트가 직접 emit/navigate하지 않는다는 프로젝트 원칙).
 */
export function useGameSetupPage() {
  const navigate = useNavigate()

  const [uiVisible, setUiVisible] = useState(false)
  const [isCreating, setIsCreating] = useState(false)

  // 더블클릭 등으로 emit 자체가 두 번 나가는 것을 막는 클라이언트 측 보조 장치입니다.
  // 실제 중복 생성 방지는 서버의 pendingRoomTransitions가 담당하며, 이건 그저 불필요한
  // 요청을 줄이기 위한 UX 보조일 뿐이라는 점에 유의해야 합니다(서버 보호의 대체가 아님).
  const isCreatingRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setUiVisible(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // 컴포넌트가 이미 사라진 뒤에 alert를 띄우면 이미 다른 화면으로 이동한 사용자를
  // 방해할 수 있어, 언마운트 이후에는 아무것도 하지 않는다.
  const showError = (message) => {
    if (!mountedRef.current) return
    alert(message ?? CREATE_ROOM_ERROR_MESSAGES.NETWORK)
  }

  const enterRoom = (room) => {
    // 서버는 이미 방을 만들었으므로 store 반영은 언마운트 여부와 무관하게 항상 수행한다.
    // 화면을 실제로 옮기는 navigate만 마운트 여부에 따라 건너뛴다(이미 다른 화면으로 이동한
    // 사용자를 방해하지 않기 위함) — 여기서 store 반영까지 생략하면 서버는 방을 만들었는데
    // 클라이언트 상태(matchingStore)는 모르는 상태로 어긋나게 된다.
    // matching store를 설정하기 전에 인게임 store의 이전 gameId를 먼저 무효화한다 — 두 store
    // 설정 사이의 창에서 이전 세션의 지연 ack/game_ended가 도착해도 ingame gameId 비교가 더
    // 이상 그 세션과 일치하지 않으므로, 방금 커밋한 이 Room의 matching 상태를 지우지 않는다.
    useInGameStore.getState().clearGame()
    useMatchingStore.getState().setRoom(room)
    if (!mountedRef.current) return
    navigate("/game-matching")
  }

  /**
   * create_room의 ack가 유실/타임아웃됐을 때 호출합니다.
   * 서버 처리 자체는 끝났는데 응답만 못 받았을 가능성이 있어 곧바로 "실패"로 안내하지 않고,
   * get_current_room으로 실제 생성 여부를 확인합니다.
   * 서버가 pending:true(아직 socket.join 등 커밋 과정을 처리 중)를 내려주면 짧게 기다렸다
   * 다시 조회하되, CURRENT_ROOM_MAX_POLL_ATTEMPTS만큼만 시도하고 무한 polling은 하지 않습니다.
   */
  const recoverCurrentRoom = async () => {
    const socket = getSocket()
    if (!socket) {
      showError(CREATE_ROOM_ERROR_MESSAGES.NETWORK)
      return
    }

    for (let attempt = 0; attempt < CURRENT_ROOM_MAX_POLL_ATTEMPTS; attempt += 1) {
      try {
        const res = await socket.timeout(CURRENT_ROOM_TIMEOUT_MS).emitWithAck(SOCKET_EVENTS.GET_CURRENT_ROOM, {})

        if (res?.ok && res.room) {
          enterRoom(res.room)
          return
        }

        if (res?.ok && res.pending) {
          await wait(CURRENT_ROOM_POLL_INTERVAL_MS)
          continue
        }

        // ok이면서 room도 pending도 아니면 서버엔 방이 없다는 뜻 — 더 재시도해도 의미가 없다.
        break
      } catch {
        // 조회 자체가 또 실패하면 재시도하지 않고 아래 최종 안내로 넘어간다.
        break
      }
    }

    showError(CREATE_ROOM_ERROR_MESSAGES.NETWORK)
  }

  const createGame = async (settings) => {
    if (isCreatingRef.current) return
    const socket = getSocket()
    if (!socket) {
      showError(CREATE_ROOM_ERROR_MESSAGES.NETWORK)
      return
    }

    isCreatingRef.current = true
    setIsCreating(true)

    try {
      const response = await socket.timeout(CREATE_ROOM_TIMEOUT_MS).emitWithAck(SOCKET_EVENTS.CREATE_ROOM, settings)

      if (!response.ok) {
        showError(response.message)
        return
      }

      enterRoom(response.room)
    } catch {
      // ack timeout/유실은 서버 실패를 의미하지 않는다 — 방은 만들어졌는데 응답만
      // 못 받았을 수 있어 곧바로 실패 안내를 하지 않고 실제 상태를 먼저 확인한다.
      await recoverCurrentRoom()
    } finally {
      isCreatingRef.current = false
      if (mountedRef.current) setIsCreating(false)
    }
  }

  const goBackToMultiplay = () => {
    if (isCreatingRef.current) {
      // 방 생성 요청이 서버에 이미 전달됐을 수 있는 상태에서 화면을 벗어나면, 서버는 방을
      // 만들었는데(또는 만드는 중인데) 사용자는 대기방으로 이동하지 못하는 상태가 될 수 있다.
      // 화면을 나가도 서버 요청 자체를 취소하지는 않으므로("취소"라는 표현은 부정확),
      // 실제로 무슨 일이 일어날 수 있는지를 정확히 안내하고 선택은 사용자에게 맡긴다.
      const confirmed = window.confirm(
        "방 생성 요청이 진행 중입니다. 방이 생성될 수 있지만 현재 화면에서 나가시겠습니까?"
      )
      if (!confirmed) return
    }
    navigate("/multiplay")
  }

  return {
    uiVisible,
    isCreating,
    goBackToMultiplay,
    createGame,
  }
}
