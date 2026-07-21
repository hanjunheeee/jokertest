/**
 * GameMatchingPage 전용 훅 — 방 내 실시간 이벤트 수신, 서버 기준 Room 상태 재동기화,
 * 방장 액션(시작·삭제)을 담당합니다. useSocket에서 setSocket으로 공유된 소켓 인스턴스를
 * socketClient의 subscribeSocket으로 반응형 구독해 사용합니다.
 *
 * custom hook: "use"로 시작하는 이름을 가진, 여러 React 훅을 조합해 재사용
 * 가능한 로직 덩어리로 묶은 함수입니다. 이 훅은 소켓 이벤트 구독·해제와
 * 방장 액션 emit을 캡슐화하고, 컴포넌트에서 바로 쓸 수 있는
 * { deleteRoom, startGame, setReady, isStarting, isSettingReady, isRoomVerified } 값을 반환합니다.
 *
 * 구독(on)하는 소켓 이벤트: player_joined_room, player_left_room,
 * host_changed, player_ready_changed, room_deleted, game_started, connect, disconnect
 * (game_started는 아직 서버가 보내지 않지만 다음 GameSession 슬라이스의 성공 방송을
 * 위해 미리 등록해 둔다. connect는 재연결마다 get_current_room 재조회를 트리거하고,
 * disconnect는 진행 중인 확인 작업을 즉시 무효화하고 waiting_socket으로 되돌린다)
 * 구독하는 브라우저 이벤트: window의 online/offline — Socket.IO의 connect/disconnect가
 * 아직 발생하지 않은 짧은 구간(예: DevTools Network Offline 직후)에도 즉시 반응하기 위함이다.
 * offline은 disconnect와 동일하게 확인 작업을 무효화하고 waiting_socket으로 전환하며,
 * online은 소켓이 이미 connected면 새 확인 시리즈를 시작하고 아니면 connect를 기다린다.
 * 발행(emit)하는 소켓 이벤트: delete_room(deleteRoom 호출 시),
 * start_game(startGame 호출 시, ack로 응답받음), set_ready(setReady 호출 시, ack로 응답받음),
 * get_current_room(화면 진입·재연결 시 ack로 현재 Room 상태를 재확인)
 */
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { getSocket, subscribeSocket } from '@/shared/socket/socketClient'
import { useMatchingStore } from '../store/matchingStore'
import { useInGameStore } from '../../ingame/store/ingameStore'
import { useAuthStore } from '@/domains/auth/store/auth.store'

// start_game/set_ready 모두 ack 기반이라 socket.timeout()으로 응답 유실(네트워크 등)에 대비한다.
const START_GAME_TIMEOUT_MS = 8000
const SET_READY_TIMEOUT_MS = 5000

// getSocket()이 null일 때(연결 준비 전/유실) 보여줄 고정 안내 문구. 내부 구현(소켓 유무)을
// 그대로 노출하지 않고, 사용자가 취할 수 있는 행동(잠시 후 재시도)만 안내한다.
const SOCKET_UNAVAILABLE_MESSAGE = '서버 연결을 확인할 수 없습니다. 잠시 후 다시 시도해주세요.'

// get_current_room ack 자체의 timeout이다(응답이 하나도 안 올 때).
const CURRENT_ROOM_CHECK_TIMEOUT_MS = 5000
// pending:true(서버가 이 uuid의 create_room/join_room_by_code를 아직 처리 중) 응답을 받았을 때
// 재조회 간격·최대 횟수다. useGameSetupPage.js의 CURRENT_ROOM_POLL_INTERVAL_MS(700ms)와
// 같은 값을 쓰되, 새로운 도메인 간 import를 만들지 않기 위해 이 파일에 로컬로 다시 정의한다.
// "최초 1회 + 재조회 3회 = 총 4회"로 그 파일의 "총 4회" 관례와 시도 횟수를 맞췄다.
const CURRENT_ROOM_PENDING_RETRY_INTERVAL_MS = 700
const CURRENT_ROOM_PENDING_MAX_RETRIES = 3

export function useMatchingRoom({ onRoomDeleted, onGameStarted }) {
  // roomId가 바뀔 때만 리렌더링되도록 matchingStore에서 roomId 값만 구독 (selector 패턴)
  const roomId = useMatchingStore((s) => s.roomId)

  // socketClient의 socket 참조를 반응형으로 구독한다. App의 useSocket effect가 자식보다
  // 늦게 실행돼 이 훅이 먼저 마운트되더라도(React의 자식-먼저 passive effect 순서),
  // getSocket()을 한 번만 읽는 대신 이 값을 구독해두면 소켓이 나중에 생기는 순간
  // 컴포넌트가 자동으로 리렌더링되어 재조회를 시작할 수 있다(polling 불필요).
  const socket = useSyncExternalStore(subscribeSocket, getSocket, getSocket)

  // 화면 진입·재연결 시 서버의 현재 Room 상태와 matchingStore를 재동기화한 결과다.
  // 'verified'일 때만 Ready·게임 시작 요청을 허용한다(matchingStore가 아닌 이 훅의 로컬
  // 상태로 둔다 — isStarting/isSettingReady와 같은 성격의 휘발성 화면 상태이지 서버가
  // 보장하는 공유 진실이 아니기 때문).
  const [roomSyncStatus, setRoomSyncStatus] = useState('waiting_socket')

  const [isStarting, setIsStarting] = useState(false)
  const [isSettingReady, setIsSettingReady] = useState(false)
  const isStartingRef = useRef(false)
  const isSettingReadyRef = useRef(false)
  const mountedRef = useRef(true)
  // start_game/set_ready 각각의 독립적인 요청 세대 번호다. get_current_room 확인 시리즈의
  // activeRequestVersion과는 완전히 별개로 관리한다(섞으면 Room 확인 재시도 로직과 액션
  // 요청의 늦은 응답 방어가 서로의 판단에 영향을 주게 된다). Socket disconnect/offline/교체
  // 시 아래 invalidateActionRequests가 이 값을 증가시켜, 그 이후 도착하는 이전 요청의
  // ack/timeout을 전부 "낡은 세대"로 만든다.
  const startRequestVersionRef = useRef(0)
  const readyRequestVersionRef = useRef(0)

  // 게임 시작 요청 잠금 해제를 한 곳에 모아, 성공(game_started 방송)/실패(ack)/timeout/
  // 언마운트 네 경로 모두 반드시 이 함수를 거치게 해서 해제를 빠뜨리는 경로가 생기지 않게
  // 한다. 서버가 최종 검증을 다시 하므로 이 잠금은 서버 방어를 대체하지 않는 프런트 UX
  // 보조일 뿐이다. timeout은 이제 socket.timeout()이 직접 처리하므로 별도 타이머는 없다.
  const clearStartState = () => {
    isStartingRef.current = false
    if (mountedRef.current) setIsStarting(false)
  }
  // clearStartState와 동일한 목적의 준비 요청 잠금 해제 함수다. setReady의 finally와
  // invalidateActionRequests 양쪽에서 재사용한다.
  const clearReadyState = () => {
    isSettingReadyRef.current = false
    if (mountedRef.current) setIsSettingReady(false)
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearStartState()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // useEffect(setup, deps)는 "렌더링이 끝난 뒤에 실행할 부수 효과"를 등록하는
  // 훅입니다. deps 배열 안의 값이 바뀔 때마다 setup이 다시 실행되는데, 그 전에
  // 반드시 이전 setup이 반환한 cleanup 함수가 먼저 호출됩니다.
  // 여기서는 roomId가 바뀔 때(다른 방으로 이동할 때)마다 소켓 이벤트를 다시
  // 등록해야 하므로 deps에 roomId를 넣었고, 콜백 내부에서 참조하는
  // onRoomDeleted·onGameStarted도 최신 값을 쓰기 위해 함께 넣었습니다.
  useEffect(() => {
    if (!socket || !roomId) return

    const { addPlayer, removePlayer, updateHost, setPlayerReady, clearRoom } = useMatchingStore.getState()

    const handlePlayerJoinedRoom = ({ player, canStart }) => addPlayer(player, canStart)
    const handlePlayerLeftRoom = ({ uuid, canStart }) => removePlayer(uuid, canStart)
    const handleHostChanged = ({ hostUuid, canStart }) => updateHost(hostUuid, canStart)
    // 다른 참가자의 준비 상태 변경 알림이다. 본인의 변경은 setReady의 ack 응답으로 반영한다
    // (자기 자신에게는 이 이벤트가 오지 않는다 — 서버가 socket.to(roomId)로만 방송한다).
    const handlePlayerReadyChanged = ({ uuid, isReady, canStart }) => {
      setPlayerReady(uuid, isReady, canStart)
    }
    const handleRoomDeleted = () => {
      clearRoom()
      onRoomDeleted?.()
    }
    // 서버는 아직 이 이벤트를 어떤 경로로도 보내지 않는다(GameSession 미구현). 실제 성공
    // 방송이 생길 다음 슬라이스를 위해 리스너 자체는 미리 등록해 둔다.
    const handleGameStarted = (payload) => {
      clearStartState()
      useInGameStore.getState().setGamePayload(payload)
      clearRoom()
      onGameStarted?.(payload)
    }

    socket.on('player_joined_room', handlePlayerJoinedRoom)
    socket.on('player_left_room', handlePlayerLeftRoom)
    socket.on('host_changed', handleHostChanged)
    socket.on('player_ready_changed', handlePlayerReadyChanged)
    socket.on('room_deleted', handleRoomDeleted)
    socket.on('game_started', handleGameStarted)

    // cleanup: effect가 재실행되기 직전이나 컴포넌트가 사라질 때 호출되어
    // 이전에 등록한 리스너를 정리합니다. 이게 없으면 roomId가 바뀔 때마다
    // 이벤트 핸들러가 중복 등록되어 같은 이벤트가 여러 번 처리될 수 있습니다.
    // 각 off는 등록할 때와 동일한 함수 참조로 호출한다 — event명만으로 off하면 같은
    // 이벤트에 대한 다른 구독자의 리스너까지 함께 지워질 수 있다.
    return () => {
      socket.off('player_joined_room', handlePlayerJoinedRoom)
      socket.off('player_left_room', handlePlayerLeftRoom)
      socket.off('host_changed', handleHostChanged)
      socket.off('player_ready_changed', handlePlayerReadyChanged)
      socket.off('room_deleted', handleRoomDeleted)
      socket.off('game_started', handleGameStarted)
    }
  }, [socket, roomId, onRoomDeleted, onGameStarted])

  // Room 상태 재동기화 effect. 위 이벤트 리스너 effect와 의도적으로 분리했다 — 저 effect는
  // roomId가 있어야만(이미 방에 있다는 전제) 의미가 있지만, 이 effect는 roomId가 없어도(오히려
  // 없는 게 맞는지 확인해야 하므로) 항상 돌아야 한다. 하나로 합치면 이 effect가 자기 자신의
  // setRoom 호출로 roomId를 바꿔 무한 재조회 루프에 빠지거나, 반대로 roomId 없이는 아예
  // 실행되지 않아 유령 Room을 정정할 기회를 놓친다. 그래서 deps에 roomId를 넣지 않는다.
  useEffect(() => {
    if (!socket) {
      setRoomSyncStatus('waiting_socket')
      return
    }

    // 이 effect 인스턴스(현재 socket)에 속한 모든 진행 중 요청·예약된 timer를 무효화하는 데
    // 쓰는 지역 변수들이다. socket이 바뀌거나 컴포넌트가 사라지면 cleanup에서 즉시 갱신된다.
    let cancelled = false
    let retryTimer = null
    let activeSeriesId = 0
    let activeRequestVersion = 0
    // "확인 에피소드"(최초 연결/재연결/소켓 교체/확인 성공마다 새로 시작)당 confirm을 1회만
    // 띄우기 위한 플래그다. effect 전체 수명 동안 한 번만 true로 고정되지 않는다(5절 정책).
    let hasPromptedRetry = false

    // 현재 활성 시리즈에 속한 모든 진행 중 요청·예약된 재시도 timer를 무효화한다.
    // effect cleanup과 disconnect 처리 둘 다 "지금 하던 확인 작업을 전부 버린다"는
    // 같은 일을 하므로 이 지역 함수 하나로 공유한다(범용 유틸로 분리하지 않음).
    const invalidateActiveCheck = () => {
      activeSeriesId += 1
      activeRequestVersion += 1
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer)
        retryTimer = null
      }
    }

    // start_game/set_ready의 진행 중 요청 세대를 무효화하고 잠금도 즉시 해제한다. get_current_room
    // 확인 시리즈(invalidateActiveCheck)와는 의도적으로 별개의 함수·카운터로 둔다(6절 정책 —
    // 두 로직을 혼용하지 않는다). 세대를 먼저 올려 늦게 도착하는 이전 ack이 항상 낡은 것으로
    // 판정되게 한 뒤, 잠금도 여기서 바로 풀어 재연결 후 검증이 끝나면 곧바로 새 요청을 보낼 수
    // 있게 한다 — 늦은 finally가 도착할 때까지 기다리지 않는다.
    const invalidateActionRequests = () => {
      startRequestVersionRef.current += 1
      readyRequestVersionRef.current += 1
      clearStartState()
      clearReadyState()
    }

    // 실패를 최종 확정하고, 필요하면 confirm으로 같은 에피소드 안에서 1회 재시도를 제안한다.
    const settleFailed = (seriesId) => {
      // 이 실패가 이미 낡은 시리즈(그사이 reconnect나 새 재시도가 시작됨)의 것이면 무시한다.
      if (cancelled || seriesId !== activeSeriesId) return
      setRoomSyncStatus('failed')
      if (hasPromptedRetry) return // 같은 에피소드에서 confirm을 반복해서 띄우지 않는다.
      hasPromptedRetry = true
      // 기존 useGameSetupPage.js의 goBackToMultiplay와 동일한 네이티브 confirm 패턴을
      // 재사용한다 — 새 UI 없이, 실패 후 새로고침 외의 재시도 수단을 제공하기 위함이다.
      if (window.confirm('방 상태를 확인하지 못했습니다. 다시 확인하시겠습니까?')) {
        // prompt 상태(hasPromptedRetry=true)는 유지한 채 같은 에피소드의 재시도로 시작한다.
        startCheckSeries({ resetPromptState: false })
      }
    }

    // 같은 시리즈 내부의 실제 get_current_room 요청 1회와, 응답이 pending일 때의 재시도
    // 예약만 담당한다(시리즈 시작 자체는 startCheckSeries만 한다).
    const runCheckAttempt = (seriesId, retryCount) => {
      // 진입 가드: 어떤 상태 변경(activeRequestVersion 증가 포함)보다 먼저 검사한다.
      // startCheckSeries가 clearTimeout(retryTimer)을 호출해도, 그 호출 시점에 이미
      // 자바스크립트 실행 대기열에 들어가 있던 이전 timer 콜백까지 취소되지는 않는다 —
      // 그 콜백이 결국 이 함수를 호출하더라도, 낡은 seriesId를 들고 있으므로 여기서 걸러진다.
      if (cancelled || seriesId !== activeSeriesId) return

      // 연결되지 않은(또는 이미 교체된) 소켓으로는 요청 자체를 보내지 않는다. 재연결되면
      // handleConnect가, 브라우저가 다시 온라인이 되면 handleBrowserOnline이 새 시리즈로
      // 다시 시작해 주므로, 여기서는 대기 상태로만 돌려놓는다. Socket.IO의 disconnect
      // 이벤트가 아직 발생하지 않았더라도(예: DevTools Offline 직후) window.navigator.onLine은
      // 즉시 false가 되므로, socket.connected만으로는 놓치는 구간을 이 검사로 막는다.
      if (socket !== getSocket() || !socket.connected || !window.navigator.onLine) {
        setRoomSyncStatus('waiting_socket')
        return
      }

      activeRequestVersion += 1
      const requestVersion = activeRequestVersion
      const requestSocket = socket
      const requestRoomId = useMatchingStore.getState().roomId
      const requestUuid = useAuthStore.getState().user?.uuid

      // 응답을 store에 반영하기 직전(비동기, ack 도착 시점)의 2차 검사다. 위 진입 가드(동기,
      // 호출 시점)와는 다른 순간을 방어한다 — setSocket(newSocket)이 구독자에게 알린 시점과
      // React가 실제로 이 effect의 cleanup(cancelled=true)을 실행하는 시점 사이의 짧은
      // 구간에도 옛 소켓으로 보낸 ack이 도착할 수 있어, requestSocket과 현재 getSocket()을
      // 직접 참조 비교해 그 구간까지 명시적으로 막는다.
      const isStale = () =>
        cancelled ||
        requestSocket !== getSocket() ||
        seriesId !== activeSeriesId ||
        requestVersion !== activeRequestVersion ||
        !mountedRef.current ||
        useMatchingStore.getState().roomId !== requestRoomId ||
        useAuthStore.getState().user?.uuid !== requestUuid

      requestSocket.timeout(CURRENT_ROOM_CHECK_TIMEOUT_MS).emitWithAck('get_current_room', {})
        .then((response) => {
          if (isStale()) return

          if (!response?.ok) {
            settleFailed(seriesId)
            return
          }

          if (response.room) {
            // 서버가 현재 Room이 있음을 확인했다 — payload 전체로 store를 최신화한다.
            useMatchingStore.getState().setRoom(response.room)
            setRoomSyncStatus('verified')
            hasPromptedRetry = false // Room 확인 성공도 새 에피소드의 시작점이다.
            return
          }

          if (response.pending) {
            // 아직 최종 확정이 아니다(같은 uuid의 create_room/join_room_by_code 처리 중일 수
            // 있음) — 무기한 대기하지 않고 이 시리즈 안에서만 제한된 횟수로 재조회한다.
            if (retryCount < CURRENT_ROOM_PENDING_MAX_RETRIES) {
              retryTimer = window.setTimeout(() => {
                retryTimer = null
                runCheckAttempt(seriesId, retryCount + 1)
              }, CURRENT_ROOM_PENDING_RETRY_INTERVAL_MS)
              return
            }
            settleFailed(seriesId)
            return
          }

          // room:null, pending 아님 → 서버가 "참여 중인 방 없음"을 명시적으로 확정했다.
          // 클라이언트가 가진 roomId를 신뢰하지 않고 이 서버 판단만을 기준으로 정리한다.
          useMatchingStore.getState().clearRoom()
          onRoomDeleted?.() // 곧 이 컴포넌트가 언마운트되므로 별도의 "no_room" 지속 상태는 두지 않는다.
        })
        .catch(() => {
          // socket.timeout()이 던지는 timeout이거나 그 외 예기치 못한 오류다. "Room 없음"과
          // 구분해 store는 건드리지 않는다 — timeout은 서버에 방이 없다는 증거가 아니다.
          if (!isStale()) settleFailed(seriesId)
        })
    }

    // 새로운 "확인 시리즈"의 시작점이다. 최초 연결 확인·connect(재연결)·confirm 재시도
    // 세 계기에서만 호출된다.
    const startCheckSeries = ({ resetPromptState }) => {
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer)
        retryTimer = null
      }
      activeSeriesId += 1 // 이전 시리즈에 속한 진행 중 요청·예약된 재시도를 전부 무효화한다.
      if (resetPromptState) hasPromptedRetry = false
      setRoomSyncStatus('checking')
      runCheckAttempt(activeSeriesId, 0) // retryCount는 이 시리즈 전용으로 항상 0부터 시작한다.
    }

    if (socket.connected) {
      startCheckSeries({ resetPromptState: true })
    } else {
      setRoomSyncStatus('waiting_socket')
    }

    // 같은 소켓의 transport가 끊겼다 다시 붙을 때마다(또는 최초 연결 시) 새 확인 시리즈를
    // 시작한다. socket 참조 자체가 바뀌는 경우는 이 effect가 통째로 재실행되어 처리된다.
    const handleConnect = () => startCheckSeries({ resetPromptState: true })
    // verified 상태에서도 transport가 끊기면 즉시 비검증 상태로 되돌린다 — 그렇지 않으면
    // disconnect 이후에도 Ready·게임 시작 요청이 계속 허용되는 문제가 생긴다. 새 요청은
    // 시작하지 않고(연결이 없으므로), matchingStore·confirm·navigation 무엇도 건드리지
    // 않는다 — "서버에 방이 없다"는 판단이 아니라 "지금은 확인할 수 없다"는 판단이기 때문이다.
    const handleDisconnect = () => {
      invalidateActiveCheck()
      invalidateActionRequests()
      setRoomSyncStatus('waiting_socket')
    }
    // 브라우저 자체가 오프라인이 되면(DevTools Network Offline 포함) Socket.IO의 disconnect
    // 이벤트가 도착하기 전에도 즉시 비검증 상태로 되돌린다 — disconnect 이벤트는 실제
    // transport가 끊긴 것을 서버/클라이언트가 감지한 뒤에야 발생해 그 사이 지연이 있을 수
    // 있는데, 그 지연 구간에도 verified가 남아있으면 안 되기 때문이다. handleDisconnect와
    // 동일하게 store·confirm·navigation은 건드리지 않고 새 요청도 시작하지 않는다.
    const handleBrowserOffline = () => {
      invalidateActiveCheck()
      invalidateActionRequests()
      setRoomSyncStatus('waiting_socket')
    }
    // 브라우저가 다시 온라인이 되면 재확인을 시도한다. 다만 이 판단 시점에 이미 이 effect
    // 인스턴스가 무효화됐거나(cancelled) 소켓이 교체됐다면(socket !== getSocket()) 아무것도
    // 하지 않는다 — 그 경우는 새 effect 인스턴스나 다른 핸들러가 처리할 몫이다. Socket.IO
    // 자체는 아직 재연결 전일 수 있으므로, socket.connected가 아니면 waiting_socket을 유지한
    // 채 기존 handleConnect가 실제 재연결을 감지할 때까지 기다린다(여기서 강제로 조회하지
    // 않음). connect와 online이 거의 동시에 발생해도 startCheckSeries가 activeSeriesId를
    // 매번 증가시켜 이전 timer·series를 무효화하므로 잘못된 응답 적용이나 중복 조회로
    // 이어지지 않는다.
    const handleBrowserOnline = () => {
      if (cancelled) return
      if (socket !== getSocket()) return
      if (socket.connected) startCheckSeries({ resetPromptState: true })
    }
    socket.on('connect', handleConnect)
    socket.on('disconnect', handleDisconnect)
    window.addEventListener('offline', handleBrowserOffline)
    window.addEventListener('online', handleBrowserOnline)

    return () => {
      cancelled = true
      invalidateActiveCheck()
      // 이 effect가 재실행되거나(socket 참조 교체) 컴포넌트가 사라질 때도 진행 중이던
      // start_game/set_ready 요청을 무효화한다 — 그 소켓과 결부된 요청이 더 이상 지금
      // 상태와 무관해지기 때문이다.
      invalidateActionRequests()
      socket.off('connect', handleConnect)
      socket.off('disconnect', handleDisconnect)
      window.removeEventListener('offline', handleBrowserOffline)
      window.removeEventListener('online', handleBrowserOnline)
    }
  }, [socket, onRoomDeleted])

  const isRoomVerified = roomSyncStatus === 'verified'

  // 방장이 "방 삭제" 버튼을 눌렀을 때 서버로 delete_room 이벤트 emit
  const deleteRoom = () => getSocket()?.emit('delete_room')

  // 방장이 "게임 시작" 버튼을 눌렀을 때 서버로 start_game을 ack로 요청한다. 서버가 최종
  // 권한·조건 검증을 다시 하므로, 여기서는 응답 오기 전 연타로 생기는 불필요한 중복
  // 요청만 줄인다(서버 방어를 대체하지 않는 프런트 UX 보조). isStarting은 성공/실패/
  // timeout 어느 경로로 끝나든 finally에서 반드시 해제한다.
  const startGame = async () => {
    if (isStartingRef.current) return
    const socket = getSocket()
    if (!socket || !socket.connected || !window.navigator.onLine) {
      // 소켓이 아예 없거나 transport가 끊겼거나(Socket.IO disconnect 발생 여부와 무관하게)
      // 브라우저 자체가 오프라인이면 요청 자체를 보낼 수 없다 — 조용히 실패하지 않고
      // 사용자가 알 수 있게 안내한다. 잠금·store는 건드리지 않는다(시도조차 하지
      // 않았으므로). disconnect/offline 직후 리렌더로 버튼이 잠기기 전의 짧은 구간도
      // 이 검사로 막는다.
      alert(SOCKET_UNAVAILABLE_MESSAGE)
      return
    }
    if (roomSyncStatus !== 'verified') {
      // 버튼 disabled(UX 보호)와 별개로 실제 요청 경계를 여기서 다시 막는다 — 비활성화 갱신과
      // 클릭 사이의 짧은 경합이나 프로그래매틱 트리거에 대비한 방어다.
      alert('현재 방 상태를 확인하고 있습니다. 잠시 후 다시 시도해주세요.')
      return
    }

    // 이 요청만의 세대 번호를 부여한다. 요청 도중 disconnect/offline/소켓 교체가 일어나면
    // Room 동기화 effect의 invalidateActionRequests가 이 카운터를 미리 올려 두므로, 그 뒤에
    // 도착하는 이 요청의 ack/timeout은 항상 "낡은 세대"로 판정되어 alert·store를 건드리지 않는다.
    startRequestVersionRef.current += 1
    const requestVersion = startRequestVersionRef.current
    const requestSocket = socket
    // 응답이 도착하기 전에 방을 나가거나, 다른 방으로 옮기거나, 계정이 바뀌면(재로그인 등)
    // 이 ack는 더 이상 지금 화면과 무관한 "늦은 응답"이 된다 — setReady와 같은 기준으로
    // 요청 시점의 방/사용자를 캡처해 두고, 응답이 왔을 때 그 사이 바뀌지 않았는지 다시 확인한다.
    const requestRoomId = useMatchingStore.getState().roomId
    const requestUuid = useAuthStore.getState().user?.uuid
    const isStaleResponse = () => {
      if (!mountedRef.current) return true
      if (requestVersion !== startRequestVersionRef.current) return true
      if (requestSocket !== getSocket()) return true
      if (!requestSocket.connected) return true
      if (!window.navigator.onLine) return true
      const current = useMatchingStore.getState()
      if (!current.isInRoom || current.roomId !== requestRoomId) return true
      if (useAuthStore.getState().user?.uuid !== requestUuid) return true
      return false
    }

    isStartingRef.current = true
    setIsStarting(true)
    try {
      const response = await socket.timeout(START_GAME_TIMEOUT_MS).emitWithAck('start_game', {})
      if (isStaleResponse()) return

      if (!response?.ok) {
        alert(response?.message ?? '게임을 시작할 수 없습니다.')
      }
      // response.ok는 이번 슬라이스에서 항상 false다(GAME_CORE_NOT_READY 등). 실제 성공은
      // 다음 GameSession 슬라이스에서 game_started 방송으로 처리되며, 그 경로는 위의
      // handleGameStarted가 별도로 clearStartState를 호출해 잠금을 해제한다.
    } catch {
      // socket.timeout()이 던지는 타임아웃 오류다 — 서버가 보낸 구체적인 실패 사유가 아니므로
      // 일반 실패 메시지와 구분해 안내한다.
      if (!isStaleResponse()) alert('게임 시작 요청이 응답하지 않습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      // 이 요청이 아직 자기 세대를 소유하고 있을 때만 잠금을 해제한다. 그사이 disconnect 등으로
      // invalidateActionRequests가 세대를 이미 올리고 잠금도 풀어놨다면(또는 그 뒤 사용자가
      // 새 요청을 또 시작했다면) 여기서는 아무것도 하지 않는다 — 그래야 이 늦은 finally가
      // 이후에 시작된 새 요청의 잠금을 실수로 풀어버리는 일이 생기지 않는다.
      if (requestVersion === startRequestVersionRef.current) {
        clearStartState()
      }
    }
  }

  // 참가자가 "준비 완료/준비 취소" 버튼을 눌렀을 때 원하는 목표 상태를 서버에 요청한다.
  // set_ready는 ack 기반이라 요청 중 버튼을 잠가 중복 요청을 줄인다(여기서도 서버가
  // 최종 상태를 결정하므로 이 잠금은 UX 보조일 뿐이다).
  const setReady = async (isReady) => {
    if (isSettingReadyRef.current) return
    const socket = getSocket()
    if (!socket || !socket.connected || !window.navigator.onLine) {
      // startGame과 동일한 이유로 소켓 없음/연결 끊김/브라우저 오프라인을 함께 검사한다.
      alert(SOCKET_UNAVAILABLE_MESSAGE)
      return
    }
    if (roomSyncStatus !== 'verified') {
      alert('현재 방 상태를 확인하고 있습니다. 잠시 후 다시 시도해주세요.')
      return
    }

    // 이 요청만의 세대 번호를 부여한다(startGame과 동일한 이유·패턴).
    readyRequestVersionRef.current += 1
    const requestVersion = readyRequestVersionRef.current
    const requestSocket = socket
    // 응답이 도착하기 전에 방을 나가거나, 다른 방으로 옮기거나, 계정이 바뀌면(재로그인 등)
    // 이 ack는 더 이상 지금 화면과 무관한 "늦은 응답"이 된다 — 요청 시점의 방/사용자를
    // 캡처해 두고, 응답이 왔을 때 그 사이 바뀌지 않았는지 다시 확인한다.
    const requestRoomId = useMatchingStore.getState().roomId
    const requestUuid = useAuthStore.getState().user?.uuid
    const isStaleResponse = () => {
      if (!mountedRef.current) return true
      if (requestVersion !== readyRequestVersionRef.current) return true
      if (requestSocket !== getSocket()) return true
      if (!requestSocket.connected) return true
      if (!window.navigator.onLine) return true
      const current = useMatchingStore.getState()
      if (!current.isInRoom || current.roomId !== requestRoomId) return true
      if (useAuthStore.getState().user?.uuid !== requestUuid) return true
      return false
    }

    isSettingReadyRef.current = true
    setIsSettingReady(true)
    try {
      const response = await socket.timeout(SET_READY_TIMEOUT_MS).emitWithAck('set_ready', { isReady })
      if (isStaleResponse()) return

      if (response?.ok) {
        useMatchingStore.getState().setPlayerReady(requestUuid, response.isReady, response.canStart)
      } else {
        alert(response?.message ?? '준비 상태를 변경하지 못했습니다.')
      }
    } catch {
      if (!isStaleResponse()) alert('준비 상태를 변경하지 못했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      // startGame과 동일하게, 이 요청이 아직 자기 세대를 소유할 때만 잠금을 해제한다.
      if (requestVersion === readyRequestVersionRef.current) {
        clearReadyState()
      }
    }
  }

  return { deleteRoom, startGame, setReady, isStarting, isSettingReady, isRoomVerified }
}
