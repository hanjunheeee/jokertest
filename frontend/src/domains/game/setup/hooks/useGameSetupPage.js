import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuthStore } from "@/domains/auth/store/auth.store.js"
import { useMatchingStore } from "@/domains/game/matching/store/matchingStore.js"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { getSocket } from "@/shared/socket/socketClient.js"
import { dispatchUiSfx } from "@/shared/hooks/useSfxRuntime.js"
import {
  NEXT_ROOM_SETTINGS_RESTORE_CODES,
  useNextRoomSettingsStore,
} from "../store/nextRoomSettingsStore.js"
import { buildRoomSettingsFormState } from "../utils/roomSettingsForm.js"
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

  // F-24(AC-04/AC-05/RESTORE-24): 다음 방 생성 화면의 **초기 폼**은 이 계정의 복원 원본에서
  // 나온다. 계정 축(uuid + identityGeneration)을 함께 보는 이유는 A→B→A 왕복 때문이다 —
  // uuid만 보면 값이 원래대로 돌아와 전이 자체가 사라지고, 전환 전에 계산된 폼이 그대로 남는다.
  const accountId = useAuthStore((s) => s.user?.uuid ?? null)
  const identityGeneration = useAuthStore((s) => s.identityGeneration)
  const readRestoreSource = useNextRoomSettingsStore((s) => s.readRestoreSource)

  /**
   * 복원 원본 → 폼 상태. 실패(누락·손상·표현 불가)는 조용히 기본값으로 바꾸지 않고 코드로
   * 알린다 — 덮으면 "복원했다"는 말이 거짓이 되고, 사용자는 건드리지도 않은 값으로 방을
   * 만들게 된다(A-11). 기본값으로 시작하는 것 자체는 정상 경로이므로(유지 해제·저장 없음)
   * 그 두 경우에는 안내를 만들지 않는다.
   */
  const restore = useMemo(() => {
    if (!accountId) return { formState: null, resetKey: `none:${identityGeneration}`, notice: "" }
    const read = readRestoreSource(accountId)
    const key = `${accountId}:${identityGeneration}:${read.code}`

    if (read.code === NEXT_ROOM_SETTINGS_RESTORE_CODES.NONE
      || read.code === NEXT_ROOM_SETTINGS_RESTORE_CODES.DISABLED) {
      // AC-05: 유지가 꺼져 있거나 저장된 원본이 없으면 **항목 정의의 기본값**으로 시작한다.
      // initialFormState=null이 곧 그 계약이다(useSetupTabState.buildInitialState).
      return { formState: null, resetKey: key, notice: "" }
    }
    if (read.code === NEXT_ROOM_SETTINGS_RESTORE_CODES.CORRUPTED) {
      return {
        formState: null,
        resetKey: key,
        notice: "저장된 다음 게임 설정을 불러오지 못해 기본값으로 시작합니다.",
      }
    }
    if (read.code === NEXT_ROOM_SETTINGS_RESTORE_CODES.STORAGE_UNAVAILABLE) {
      return {
        formState: null,
        resetKey: key,
        notice: "이 브라우저에서는 설정을 저장·복원할 수 없어 기본값으로 시작합니다.",
      }
    }

    const form = buildRoomSettingsFormState(read.source)
    if (!form.ok) {
      // 서버 원본은 멀쩡한데 이 화면이 그릴 수 없는 값이다 — 기본값으로 덮되 그 사실을 알린다.
      return {
        formState: null,
        resetKey: `${key}:form-${form.code}`,
        notice: "저장된 다음 게임 설정을 이 화면에서 표현할 수 없어 기본값으로 시작합니다.",
      }
    }
    return {
      formState: form,
      resetKey: `${key}:${read.source.settingsVersion ?? ""}`,
      notice: read.code === NEXT_ROOM_SETTINGS_RESTORE_CODES.SANITIZE_WRITE_FAILED
        ? "저장된 설정을 정리해 복원했지만 정리된 값을 다시 저장하지 못했습니다."
        : "",
    }
  }, [accountId, identityGeneration, readRestoreSource])

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

  /**
   * F-24(AC-04, A-04): 생성 요청 하나의 **범위**를 한 벌로 캡처한다.
   *
   * 예전에는 ACK·timeout·복구 조회·finally가 서로 다른 시점의 상태를 각자 읽었다 — enterRoom은
   * 언마운트 뒤에도 store를 바꿨고, recoverCurrentRoom은 getSocket()을 **다시** 읽었으며,
   * finally는 어느 요청의 것인지 묻지 않고 잠금을 풀었다. 그래서 R1을 보낸 뒤 소켓이 교체되거나
   * 계정이 A→B→A로 왕복하면, R1의 늦은 ACK가 지금 화면의 방으로 커밋되고 R1의 늦은 finally가
   * R2의 잠금을 풀었다.
   *
   * 토큰은 매 요청마다 새 객체다 — 값이 같아질 수 없으므로 A→B→A에도 구별된다.
   */
  const requestScopeRef = useRef(null)
  const captureRequestScope = (socket) => ({
    token: {},
    accountId,
    identityGeneration,
    socket,
    socketId: socket?.id ?? null,
  })

  /**
   * 캡처한 범위가 **아직 현재인가**. 하나라도 어긋나면 false다(fail-closed).
   *
   * 소켓은 객체 동일성과 id를 함께 본다 — 같은 객체가 재연결되면 참조는 그대로이고 id만
   * 바뀌므로, 둘 중 하나만 보면 한쪽 전이가 판정에서 사라진다.
   */
  const isScopeCurrent = (scope) => {
    if (scope === null || requestScopeRef.current !== scope) return false
    const auth = useAuthStore.getState()
    if ((auth.user?.uuid ?? null) !== scope.accountId) return false
    if (auth.identityGeneration !== scope.identityGeneration) return false
    const socket = getSocket()
    if (socket !== scope.socket) return false
    return (socket?.id ?? null) === scope.socketId
  }

  const enterRoom = (room, scope = null) => {
    // 서버는 이미 방을 만들었으므로 store 반영은 언마운트 여부와 무관하게 항상 수행한다.
    // 화면을 실제로 옮기는 navigate만 마운트 여부에 따라 건너뛴다(이미 다른 화면으로 이동한
    // 사용자를 방해하지 않기 위함) — 여기서 store 반영까지 생략하면 서버는 방을 만들었는데
    // 클라이언트 상태(matchingStore)는 모르는 상태로 어긋나게 된다.
    // matching store를 설정하기 전에 인게임 store의 이전 gameId를 먼저 무효화한다 — 두 store
    // 설정 사이의 창에서 이전 세션의 지연 ack/game_ended가 도착해도 ingame gameId 비교가 더
    // 이상 그 세션과 일치하지 않으므로, 방금 커밋한 이 Room의 matching 상태를 지우지 않는다.
    // F-24(AC-04, A-04): 범위가 지난 응답은 **store에도 반영하지 않는다.** 위 주석의 "서버는
    // 이미 방을 만들었으므로 항상 반영한다"는 규칙은 같은 신원·같은 연결 안에서만 참이다 —
    // 계정이나 연결이 바뀐 뒤라면 그 방은 지금 이 화면이 앉을 자리가 아니고, 반영하면 현재
    // 소속을 옛 방으로 되돌린다. 범위를 아예 넘기지 않은 호출은 예전 계약 그대로다.
    if (scope !== null && !isScopeCurrent(scope)) return
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
  const recoverCurrentRoom = async (scope) => {
    // F-24(AC-04, A-04): getSocket()을 **다시 읽지 않는다**. 다시 읽으면 R1의 복구 조회가 그
    // 사이 교체된 새 연결로 나가고, 그 답이 R2가 만든 현재 소속을 되돌릴 수 있다. 조회는
    // 요청을 보낸 바로 그 연결에서만 의미가 있다.
    const socket = scope?.socket ?? null
    if (!socket || !isScopeCurrent(scope)) {
      showError(CREATE_ROOM_ERROR_MESSAGES.NETWORK)
      return
    }

    for (let attempt = 0; attempt < CURRENT_ROOM_MAX_POLL_ATTEMPTS; attempt += 1) {
      // 매 시도 직전에 다시 확인한다 — 대기(wait) 사이에 범위가 지났을 수 있다.
      if (!isScopeCurrent(scope)) return
      try {
        const res = await socket.timeout(CURRENT_ROOM_TIMEOUT_MS).emitWithAck(SOCKET_EVENTS.GET_CURRENT_ROOM, {})
        if (!isScopeCurrent(scope)) return

        if (res?.ok && res.room) {
          enterRoom(res.room, scope)
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
    const scope = captureRequestScope(socket)
    requestScopeRef.current = scope

    try {
      const response = await socket.timeout(CREATE_ROOM_TIMEOUT_MS).emitWithAck(SOCKET_EVENTS.CREATE_ROOM, settings)
      // 옛 요청의 ACK는 지금 화면의 답이 아니다 — 오류 안내도, 방 반영도 하지 않는다.
      if (!isScopeCurrent(scope)) return

      if (!response.ok) {
        showError(response.message)
        return
      }

      enterRoom(response.room, scope)
    } catch {
      // ack timeout/유실은 서버 실패를 의미하지 않는다 — 방은 만들어졌는데 응답만
      // 못 받았을 수 있어 곧바로 실패 안내를 하지 않고 실제 상태를 먼저 확인한다.
      if (!isScopeCurrent(scope)) return
      await recoverCurrentRoom(scope)
    } finally {
      // F-24(AC-04, A-04): **자기 요청의 잠금만 푼다.** 예전에는 R1의 늦은 finally가 그 사이
      // 시작된 R2의 잠금을 풀어, 서버에 두 번째 생성 요청이 나갈 수 있었다. 범위가 이미
      // 바뀐 요청은 아무것도 되돌리지 않고 그대로 물러난다.
      if (requestScopeRef.current === scope) {
        requestScopeRef.current = null
        isCreatingRef.current = false
        if (mountedRef.current) setIsCreating(false)
      }
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
      // F-16(AC-01): 생성 중에는 이 confirm 결과가 단일 소유자다 — 호출한 뒤로가기 버튼은
      // data-sfx-owner="explicit"로 일반 클릭 capture에서 제외한다.
      // 아래 평상시 경로와 달리 취소도 여기서 낸다.
      dispatchUiSfx(confirmed ? "ui-confirm" : "ui-cancel")
      if (!confirmed) return
      navigate("/multiplay")
      return
    }
    // 평상시 나가기는 확인 대화상자 없이 곧바로 이동한다 — 의미는 "취소"다.
    dispatchUiSfx("ui-cancel")
    navigate("/multiplay")
  }

  return {
    uiVisible,
    isCreating,
    goBackToMultiplay,
    createGame,
    // F-24(AC-04/AC-05): 다음 방 생성 폼의 초기값과 그 경계. 복원이 없으면 null이고, 그때
    // GameSetupPanel은 항목 정의의 기본값에서 시작한다(기존 생성 계약 그대로).
    initialFormState: restore.formState,
    formResetKey: restore.resetKey,
    // 복원 실패·정리 재저장 실패를 화면이 그대로 알린다(성공으로 바꾸지 않는다).
    restoreNotice: restore.notice,
  }
}
