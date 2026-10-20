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
import { dispatchSfxEvent, dispatchUiSfx } from '@/shared/hooks/useSfxRuntime.js'
import {
  ROOM_SETTINGS_ERROR_CODES,
  ROOM_SETTINGS_ERROR_MESSAGES,
  ROOM_SETTINGS_RESULT_TIMEOUT_MS,
  SOCKET_EVENTS,
  UPDATE_ROOM_SETTINGS_TIMEOUT_MS,
} from '@/domains/game/setup/constants/gameSetupSocket.js'
import { buildUpdateRoomSettingsPayload } from '@/domains/game/setup/utils/roomSettingsForm.js'
import { GAME_START_MESSAGES } from '../constants/gameStartMessages.js'
import {
  clearPartyRejoinGameId,
  consumePartyMatchingRoomReady,
  persistPartyRejoinGameId,
  rememberPartyMatchingRoomReady,
} from '../utils/partyMatchingRejoin.js'

/**
 * F-16(AC-01/AC-04): 방 범위 사건 하나를 공통 재생기로 넘긴다.
 *
 * 서버가 준 봉투(eventId·roomId)를 그대로 쓰고 계정만 현재 인증 상태에서 채운다. 서버가
 * 봉투를 주지 않았거나(멱등 재요청 등 실제 변경이 아닌 응답) 형태가 다르면 아무 소리도
 * 내지 않는다 — 프런트가 ID를 지어내면 중복 전달마다 새 소리가 난다.
 *
 * 재생기 쪽에서 roomId를 현재 방과 다시 대조하므로, 방을 떠난 뒤 도착한 늦은 응답은
 * 거부된다. 이 함수는 어떤 경우에도 던지지 않는다(업무 상태 반영을 막지 않는다).
 */
const playRoomSfx = (kind, sfxEvent) => {
  if (sfxEvent === null || typeof sfxEvent !== 'object') return
  const { user, isLoggedIn } = useAuthStore.getState()
  const accountId = isLoggedIn && user?.uuid ? user.uuid : null
  if (accountId === null) return
  dispatchSfxEvent({
    kind,
    eventId: sfxEvent.eventId,
    accountId,
    roomId: sfxEvent.roomId,
    origin: sfxEvent.origin,
  })
}

/**
 * F-20(AC-04): 준비 사건(방송 또는 자기 ACK) 하나가 지금 화면이 아는 사실보다 **과거의 것**인지
 * 판정한다.
 *
 * 두 기준을 함께 본다.
 *   - settingsVersion: 설정이 바뀌면 서버가 전원 준비를 해제한다. 그 해제 스냅샷을 이미
 *     적용했는데 그 이전 버전에서 발행된 "준비 완료"가 뒤늦게 도착하면, 그대로 반영할 경우
 *     해제가 조용히 되돌아간다.
 *   - readyRevision: 같은 버전 안에서도 준비는 여러 번 바뀐다. 이미 더 큰(또는 같은) revision을
 *     반영했다면 이 사건은 중복이거나 과거다.
 *
 * 서버가 값을 싣지 않았거나 화면에 비교 대상이 없으면 판정하지 않는다(기존 동작 유지) —
 * 없는 근거로 정상 사건을 버리지 않기 위함이다.
 */
const READY_EVENT = Object.freeze({ APPLY: 'apply', STALE: 'stale', NEWER: 'newer' })

const classifyReadyEvent = (state, uuid, { settingsVersion, readyRevision }) => {
  if (Number.isSafeInteger(settingsVersion)) {
    // 우리가 **어떤 설정 위에 있는지 모르는** 상태에서는 준비를 반영하지 않는다. 그 사건이
    // 지금 설정의 것인지 판단할 근거가 없고, 사건 자체를 소속·설정의 증거로 승격시키면
    // 서버가 확정하지 않은 상태를 화면이 만들어내게 된다 — 대신 권위 있는 재조회를 건다.
    if (!Number.isSafeInteger(state.settingsVersion)) return READY_EVENT.NEWER
    if (settingsVersion > state.settingsVersion) {
      // 우리가 아직 보지 못한 더 새로운 설정에서 일어난 준비 변경이다. 영원히 버리면 그
      // 참가자의 준비 표시가 다음 전체 조회 때까지 굳는다 — 버리되, 최신 상태를 다시
      // 확보하도록 **제한된** 재조회 한 번을 건다(방송을 그대로 믿지 않는다).
      return READY_EVENT.NEWER
    }
    if (settingsVersion < state.settingsVersion) return READY_EVENT.STALE
  }
  const player = state.players.find((p) => p.uuid === uuid)
  if (Number.isInteger(readyRevision) && Number.isInteger(player?.readyRevision)
    && readyRevision <= player.readyRevision) return READY_EVENT.STALE
  return READY_EVENT.APPLY
}

/**
 * F-20(AC-05): 응답에 실린 방 스냅샷이 **우리가 아직 보지 못한 더 새로운 설정 버전**을
 * 드러내는가.
 *
 * 적용 세대가 올라갔다는 사실은 "그 사이 무언가를 반영했다"만 말할 뿐, 그것이 **설정**이었다는
 * 뜻이 아니다. v1에서 발행된 준비 방송 하나가 늦게 끼어들었다는 이유로 응답이 실어 온 v2를
 * 통째로 버리면, 화면은 v1에 머문 채 그 버전을 기대 버전으로 삼아 편집을 계속 허용한다.
 *
 * 스냅샷을 **통째로 적용하는 것**(그 뒤에 일어난 방장 이전·준비 변경까지 되돌릴 위험이 있다)과
 * **더 새로운 설정이 존재한다는 사실을 아는 것**은 다른 일이다. 여기서는 후자만 판정하고,
 * 실제 값은 권위 있는 조회로 다시 확보한다. 같거나 더 낮은 버전·다른 방·버전이 없는 응답은
 * 아무것도 드러내지 않으므로 여분의 조회를 만들지 않는다.
 */
const revealsNewerSettingsVersion = (room) => {
  if (room === null || typeof room !== 'object') return false
  const { roomId, settingsVersion: known } = useMatchingStore.getState()
  if (room.roomId !== roomId) return false
  const incoming = room.settingsVersion
  if (!Number.isSafeInteger(incoming)) return false
  // 우리가 어떤 설정 위에 있는지조차 모르는 상태라면, 버전을 실은 응답은 그 자체로 더 새로운 사실이다.
  if (!Number.isSafeInteger(known)) return true
  return incoming > known
}

// start_game/set_ready 모두 ack 기반이라 socket.timeout()으로 응답 유실(네트워크 등)에 대비한다.
const START_GAME_TIMEOUT_MS = 8000
const SET_READY_TIMEOUT_MS = 5000

// getSocket()이 null일 때(연결 준비 전/유실) 보여줄 고정 안내 문구. 내부 구현(소켓 유무)을
// 그대로 노출하지 않고, 사용자가 취할 수 있는 행동(잠시 후 재시도)만 안내한다.
const SOCKET_UNAVAILABLE_MESSAGE = GAME_START_MESSAGES.SOCKET_UNAVAILABLE

// get_current_room ack 자체의 timeout이다(응답이 하나도 안 올 때).
const CURRENT_ROOM_CHECK_TIMEOUT_MS = 5000
// pending:true(서버가 이 uuid의 create_room/join_room_by_code를 아직 처리 중) 응답을 받았을 때
// 재조회 간격·최대 횟수다. useGameSetupPage.js의 CURRENT_ROOM_POLL_INTERVAL_MS(700ms)와
// 같은 값을 쓰되, 새로운 도메인 간 import를 만들지 않기 위해 이 파일에 로컬로 다시 정의한다.
// "최초 1회 + 재조회 3회 = 총 4회"로 그 파일의 "총 4회" 관례와 시도 횟수를 맞췄다.
const CURRENT_ROOM_PENDING_RETRY_INTERVAL_MS = 700
const CURRENT_ROOM_PENDING_MAX_RETRIES = 3
const PARTY_MATCHING_ROOM_POLL_MS = 2500
const PARTY_MATCHING_ROOM_POLL_TIMEOUT_MS = 5000

export function useMatchingRoom({
  onRoomDeleted,
  onGameStarted,
  endedGameId = null,
  awaitPartyRoomRejoin = false,
}) {
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
  const endedGameIdRef = useRef(endedGameId)
  endedGameIdRef.current = endedGameId
  const awaitPartyRoomRejoinRef = useRef(awaitPartyRoomRejoin)
  awaitPartyRoomRejoinRef.current = awaitPartyRoomRejoin
  const partyRejoinInFlightRef = useRef(false)
  // start_game/set_ready 각각의 독립적인 요청 세대 번호다. get_current_room 확인 시리즈의
  // activeRequestVersion과는 완전히 별개로 관리한다(섞으면 Room 확인 재시도 로직과 액션
  // 요청의 늦은 응답 방어가 서로의 판단에 영향을 주게 된다). Socket disconnect/offline/교체
  // 시 아래 invalidateActionRequests가 이 값을 증가시켜, 그 이후 도착하는 이전 요청의
  // ack/timeout을 전부 "낡은 세대"로 만든다.
  const startRequestVersionRef = useRef(0)
  const readyRequestVersionRef = useRef(0)
  // F-20: 설정 저장 요청의 독립 세대. start/ready와 섞지 않는다(같은 이유 — 서로의 늦은 응답
  // 방어에 영향을 주면 안 된다).
  const settingsRequestVersionRef = useRef(0)
  const [isSavingSettings, setIsSavingSettings] = useState(false)
  const isSavingSettingsRef = useRef(false)
  // ACK를 잃은 저장이 있으면 그 requestId를 붙잡아 둔다 — 새 저장을 만들지 않고 이 값으로만
  // 결과를 다시 묻는다(A-07). 확인이 끝나면 비운다.
  const [pendingSettingsRequest, setPendingSettingsRequest] = useState(null)
  const [settingsError, setSettingsError] = useState(null)
  /**
   * F-20(AC-05): 저장 결과를 **끝내 확인하지 못했다**는 결론.
   *
   * pendingSettingsRequest(확인 대기)와 수명이 다르다. 결과 조회가 UNKNOWN으로 끝나면 대기가
   * 풀리고 편집 패널도 이미 닫혀 있어, 그 결론을 여기에 남기지 않으면 "적용됐는지 알 수 없다"는
   * 사실이 화면에서 통째로 사라진다 — 방장은 아무 안내도 없이 저장이 됐다고 오해하게 된다.
   * 확인 절차가 끝난 뒤에도 남아야 하므로 settingsError(편집 패널 안의 실패 사유)와도 분리한다.
   */
  const [settingsResultNotice, setSettingsResultNotice] = useState(null)
  // 게임 시작 버튼 클릭 후 시작이 불가할 때 모달 본문. stale 응답은 설정하지 않는다.
  const [startBlockedMessage, setStartBlockedMessage] = useState(null)
  // F-20(AC-05): **지금 서버 응답을 기다리는** 저장의 식별자. timeout만이 결과 미확인을 만드는
  // 것이 아니다 — 응답을 기다리는 동안 연결이 끊기면 그 저장은 이미 커밋됐을 수도 있고 서버에
  // 닿지 못했을 수도 있다. 그 requestId를 여기 붙잡아 두었다가 단절 시점에 "미확인"으로
  // 승격시켜야, 재연결한 방장이 **새 저장을 만들지 않고** 같은 요청의 결과를 다시 물을 수 있다.
  const inFlightSettingsRequestRef = useRef(null)

  /**
   * F-20(AC-05): **방 상태 적용 세대**.
   *
   * 기존 방어(roomId·uuid 비교)로는 "A→B→A"나 "이 방을 나갔다가 같은 방에 다시 들어옴",
   * "설정 방송 뒤에 도착한, 그 이전에 발행된 전체 조회"를 구분할 수 없다 — 세 경우 모두
   * roomId와 uuid가 같기 때문이다. 그래서 단조 증가 카운터를 따로 두고, 소속·계정·소켓·
   * 설정 스냅샷이 바뀔 때마다 올린다. 요청 시점의 값과 응답 시점의 값이 다르면 그 응답은
   * 지금 화면과 무관한 과거의 것이다.
   */
  const roomApplyGenerationRef = useRef(0)
  // 위 세대를 올리는 함수와 "지금 다시 확인하라"는 요청을 이벤트 effect가 쓸 수 있도록
  // 동기화 effect가 여기에 심어 둔다(두 effect는 의도적으로 분리돼 있다 — 기존 주석 참고).
  const bumpRoomApplyGenerationRef = useRef(null)
  const requestRoomResyncRef = useRef(null)
  /**
   * 권위 있는 현재 방을 다시 확보한다. 동기화 effect가 살아 있으면 그쪽이 제한된 조회 시리즈를
   * 시작하고, 이미 정리된 뒤라면 **적어도 세대는 올린다** — 올리지 않으면 이 순간 이전에
   * 발행된 응답이 방금 확정한 사실을 나중에 덮는다(bumpRoomApplyGeneration과 같은 이유의 폴백).
   */
  const requestRoomResync = () => {
    if (requestRoomResyncRef.current) requestRoomResyncRef.current()
    else roomApplyGenerationRef.current += 1
  }
  /**
   * 적용 세대를 올리는 **유일한 경계**. 동기화 effect가 살아 있으면 그쪽 구현을 쓴다(진행
   * 중이던 조회를 대신할 새 조회까지 책임진다). 그 effect가 이미 정리됐어도 세대 자체는
   * 반드시 올라가야 하므로 카운터만 올리는 폴백을 둔다 — 올리지 않으면 이 순간 이전에
   * 발행된 전체 조회가 방금 반영한 사실을 덮는다.
   */
  const bumpRoomApplyGeneration = () => {
    if (bumpRoomApplyGenerationRef.current) bumpRoomApplyGenerationRef.current()
    else roomApplyGenerationRef.current += 1
  }

  /**
   * F-20(AC-05): **소속 세대**. 적용 세대와 목적이 다르다.
   *
   * 적용 세대는 "화면이 아는 방 상태가 그 뒤로 바뀌었는가"를 말하고, 소속 세대는 "이 요청이
   * 묶여 있던 그 소속이 지금도 같은 소속인가"를 말한다. R1→R2→R1이나 R1→방 없음→R1은
   * roomId·계정·소켓이 전부 같아서 다른 어떤 값으로도 구분되지 않는다 — 저장·결과 조회의
   * ACK·오류·timeout·finally는 전부 이 값으로 자기 소속을 확인해야 한다.
   */
  const roomMembershipGenerationRef = useRef(0)
  // 같은 렌더 배치에서 방 ID가 되돌아와도 새 소속의 이벤트 구독을 다시 붙인다.
  const [roomEventGeneration, setRoomEventGeneration] = useState(0)

  /**
   * F-20(AC-04): **준비·참가 인원 집계 세대**. 적용 세대·소속 세대와 또 다른 것을 센다.
   *
   * set_ready ACK는 두 가지 사실을 함께 싣는다 — 내 준비 결과(own outcome)와 방 전체 canStart다.
   * 앞의 것은 내 readyRevision이 정렬해 주지만, 뒤의 것은 **모든 참가자의 준비 상태를 입력으로
   * 삼는 집계**라 서버가 이 요청을 처리한 그 순간의 값이다. 그 사이 다른 참가자의 준비가
   * 바뀌었다면 이 ACK의 집계는 그 사실을 보지 못한 것일 수 있는데, 두 집계를 정렬해 줄 방 전체
   * revision은 어느 쪽에도 실려 있지 않다 — 내 revision이 현재라는 사실은 여기에 대해 아무것도
   * 말해 주지 않는다.
   *
   * 그래서 "그 사이 **준비·참가 인원**에 관한 사실을 반영했는가"만 따로 센다. 방장 이전·조회 재확보처럼
   * 준비·참가 인원을 바꾸지 않는 사건과 구분한다. 참가자의 입장·퇴장도 집계 입력을
   * 바꾸므로 준비 방송 및 설정 교체와 함께 이 세대를 올린다.
   */
  const readyAggregateGenerationRef = useRef(0)

  /**
   * F-20(AC-05): **지금 소켓이 어느 계정으로 handshake한 연결인가.**
   *
   * 신원이 갈리는 순간과 그 신원의 연결이 생기는 순간은 같지 않다. useSocket은 accountUuid를
   * deps로 둔 effect에서 소켓을 만들므로, 계정이 바뀌면 zustand 구독(동기)이 먼저 돌고 그
   * **뒤에** 비로소 setSocket(새 소켓)이 일어난다. 그 사이의 getSocket()은 아직 이전 계정의
   * 쿠키로 인증된 연결이라, 그 통로로 새 신원의 방을 묻고 그 응답을 믿으면 남의 소속을 내
   * 것으로 받아들이게 된다. 그래서 "소켓 참조가 바뀐 순간의 로그인 계정"을 그 연결의 신원으로
   * 각인해 두고, 현재 신원과 일치할 때만 조회를 내보낸다.
   */
  const socketIdentityRef = useRef({ socket: null, uuid: null })

  /**
   * F-20(AC-05): 지금 일어나는 방 교체가 **서버가 이미 확정해 준 것**인지 표시한다.
   *
   * 소속이 바뀌면 그 소속을 서버에 다시 물어야 하지만(아래 구독), 그 교체 자체가 권위 있는
   * 응답(현재 방 조회 결과·room_deleted·game_started)에서 온 것이라면 다시 물을 이유가 없다 —
   * 그 응답이 곧 이 소속의 근거다. 구분하지 않으면 최초 방 발견(null→방)마다 조회가 한 번 더
   * 돌고, 게임 시작·방 삭제 뒤의 여분 조회가 "방 없음"을 다시 확정해 이미 진행 중인 화면
   * 이동을 덮어쓴다. zustand 구독은 set() 안에서 **동기적으로** 실행되므로 이 플래그는 구독
   * 콜백이 읽는 시점에 정확히 참이다.
   */
  const applyingVerifiedRoomRef = useRef(false)
  const applyVerifiedRoom = (apply) => {
    applyingVerifiedRoomRef.current = true
    try { apply() } finally { applyingVerifiedRoomRef.current = false }
  }
  // 소속이 갈렸을 때 "이 소속만의 검증을 새로 받아라"를 실행하는 경계. 동기화 effect가 심는다.
  const invalidateRoomVerificationRef = useRef(null)

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
  // 위 둘과 같은 이유의 설정 저장 잠금 해제 함수다(성공/실패/timeout/무효화 네 경로 공용).
  const clearSettingsState = () => {
    isSavingSettingsRef.current = false
    if (mountedRef.current) setIsSavingSettings(false)
  }

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      clearStartState()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 결과 화면 → 매칭: room_joined(코드 참가)와 party_matching_room_ready(방장 재생성) 구독.
  // roomId가 없을 때도 돌아야 하므로 방 이벤트 effect와 분리한다.
  useEffect(() => {
    if (!socket || !awaitPartyRoomRejoinRef.current) return undefined

    const attachedSocket = socket
    const attachedUuid = useAuthStore.getState().user?.uuid ?? null
    let owned = true
    const isCurrentSource = () =>
      owned
      && attachedSocket === getSocket()
      && (useAuthStore.getState().user?.uuid ?? null) === attachedUuid

    const rememberResolvedPartyGameId = (gameId) => {
      if (typeof gameId !== 'string' || gameId.length === 0) return
      endedGameIdRef.current = gameId
      persistPartyRejoinGameId(attachedUuid, gameId)
    }

    const completePartyRejoin = (payload) => {
      if (!isCurrentSource()) return
      if (payload === null || typeof payload !== 'object') return
      const accountId = useAuthStore.getState().user?.uuid ?? null
      useInGameStore.getState().clearGame()
      useMatchingStore.getState().setRoom(payload)
      clearPartyRejoinGameId(accountId)
      partyRejoinInFlightRef.current = false
      roomApplyGenerationRef.current += 1
      if (mountedRef.current) setRoomSyncStatus('verified')
    }

    const requestPartyRejoin = (payload) => {
      if (!isCurrentSource()) return
      if (useMatchingStore.getState().isInRoom) return
      if (partyRejoinInFlightRef.current) return
      const payloadGameId = typeof payload?.gameId === 'string' ? payload.gameId : null
      const knownGameId = endedGameIdRef.current
      if (payloadGameId && knownGameId && payloadGameId !== knownGameId) return
      if (payloadGameId && !knownGameId) rememberResolvedPartyGameId(payloadGameId)
      const roomCode = payload?.room?.roomCode
      if (typeof roomCode !== 'string' || roomCode.length === 0) return
      partyRejoinInFlightRef.current = true
      const joinPayload = { roomCode }
      if (typeof payload?.room?.roomId === 'string' && payload.room.roomId.length > 0) {
        joinPayload.roomId = payload.room.roomId
      }
      socket.emit('join_room_by_code', joinPayload)
    }

    const handleRoomJoined = (payload) => {
      completePartyRejoin(payload)
    }

    const handlePartyMatchingRoomReady = (payload) => {
      rememberPartyMatchingRoomReady(payload)
      requestPartyRejoin(payload)
    }

    const syncCurrentRoomIfAny = () => {
      if (!isCurrentSource()) return Promise.resolve()
      if (!awaitPartyRoomRejoinRef.current || useMatchingStore.getState().isInRoom) {
        return Promise.resolve()
      }
      return socket
        .timeout(CURRENT_ROOM_CHECK_TIMEOUT_MS)
        .emitWithAck('get_current_room', {})
        .then((response) => {
          if (!isCurrentSource()) return
          if (response?.ok && response.room) completePartyRejoin(response.room)
        })
        .catch(() => {})
    }

    const pollPartyMatchingRoom = () => {
      if (!isCurrentSource()) return
      if (!awaitPartyRoomRejoinRef.current || useMatchingStore.getState().isInRoom) return
      void syncCurrentRoomIfAny()
      const pollPayload = endedGameIdRef.current ? { gameId: endedGameIdRef.current } : {}
      socket
        .timeout(PARTY_MATCHING_ROOM_POLL_TIMEOUT_MS)
        .emitWithAck(SOCKET_EVENTS.GET_PARTY_MATCHING_ROOM, pollPayload)
        .then((response) => {
          if (!isCurrentSource()) return
          if (!response?.ok || !response.room) return
          const resolvedGameId = response.gameId ?? endedGameIdRef.current
          if (resolvedGameId) rememberResolvedPartyGameId(resolvedGameId)
          rememberPartyMatchingRoomReady({ gameId: resolvedGameId, room: response.room })
          requestPartyRejoin({ gameId: resolvedGameId, room: response.room })
        })
        .catch(() => {
          partyRejoinInFlightRef.current = false
        })
    }

    const pendingParty = consumePartyMatchingRoomReady(endedGameIdRef.current)
    if (pendingParty) requestPartyRejoin(pendingParty)
    pollPartyMatchingRoom()

    const handleRoomJoinFailed = () => {
      partyRejoinInFlightRef.current = false
    }

    socket.on('room_joined', handleRoomJoined)
    socket.on('room_join_failed', handleRoomJoinFailed)
    socket.on('party_matching_room_ready', handlePartyMatchingRoomReady)

    const pollTimer = window.setInterval(pollPartyMatchingRoom, PARTY_MATCHING_ROOM_POLL_MS)

    return () => {
      owned = false
      window.clearInterval(pollTimer)
      socket.off('room_joined', handleRoomJoined)
      socket.off('room_join_failed', handleRoomJoinFailed)
      socket.off('party_matching_room_ready', handlePartyMatchingRoomReady)
    }
  }, [socket, endedGameId, awaitPartyRoomRejoin])

  // useEffect(setup, deps)는 "렌더링이 끝난 뒤에 실행할 부수 효과"를 등록하는
  // 훅입니다. deps 배열 안의 값이 바뀔 때마다 setup이 다시 실행되는데, 그 전에
  // 반드시 이전 setup이 반환한 cleanup 함수가 먼저 호출됩니다.
  // 여기서는 roomId가 바뀔 때(다른 방으로 이동할 때)마다 소켓 이벤트를 다시
  // 등록해야 하므로 deps에 roomId를 넣었고, 콜백 내부에서 참조하는
  // onRoomDeleted·onGameStarted도 최신 값을 쓰기 위해 함께 넣었습니다.
  useEffect(() => {
    if (!socket || !roomId) return

    const { addPlayer, removePlayer, updateHost, setPlayerReady, clearRoom, applyRoomSettings } =
      useMatchingStore.getState()

    /**
     * F-20(AC-05): **이 사건이 지금 이 화면의 통로에서 온 것인가.**
     *
     * 리스너를 해제하는 것만으로는 부족하다. setSocket(B)가 구독자에게 알리는 시점은 React가
     * 이 effect의 cleanup을 실행하는 시점보다 **먼저**라, 그 사이에 이미 남이 된 A로 도착한
     * 사건은 아직 살아 있는 이 리스너로 그대로 들어온다 — 받는 쪽이 자기 출처를 직접
     * 확인해야 한다(usePublicRooms가 쓰는 것과 같은 경계다).
     *
     * 출처와 함께 **신원·소속**도 본다. 계정이 갈리거나 소속이 갈리는 순간에도 소켓 참조는
     * 아직 그대로일 수 있는데, 그때 도착한 사건은 이전 계정·이전 소속의 사실이다. 소속 세대는
     * store 구독이 set() 안에서 동기적으로 올리므로, 이 effect가 붙는 시점에는 이미 새 값이다
     * — 정상적인 방 발견 이후의 사건을 영구히 막지 않는다.
     */
    const attachedSocket = socket
    const attachedUuid = useAuthStore.getState().user?.uuid ?? null
    const attachedMembership = roomMembershipGenerationRef.current
    let owned = true
    const isCurrentSource = () =>
      owned
      && attachedSocket === getSocket()
      && (useAuthStore.getState().user?.uuid ?? null) === attachedUuid
      && roomMembershipGenerationRef.current === attachedMembership

    // F-20(AC-05): 확정된 방 사건을 적용할 때마다 **적용 세대**를 올린다. 설정 버전만 올리면,
    // 같은 설정 버전에서 일어난 방장 이전·참가·이탈·준비 변경 뒤에 도착한 "그 이전에 발행된"
    // 전체 방 조회가 옛 방장·옛 명단·옛 준비 상태로 화면을 되돌린다 — 그 조회들은 이 세대가
    // 올라간 순간 전부 낡은 것이 된다.
    const applyRoomEvent = (apply) => {
      apply()
      bumpRoomApplyGenerationRef.current?.()
    }

    const handlePlayerJoinedRoom = ({ player, canStart }) => {
      if (!isCurrentSource()) return
      readyAggregateGenerationRef.current += 1
      applyRoomEvent(() => addPlayer(player, canStart))
    }
    const handlePlayerLeftRoom = ({ uuid, canStart, membershipId, roomId: eventRoomId }) => {
      if (!isCurrentSource()) return
      if (eventRoomId !== undefined && eventRoomId !== roomId) return // 다른 방의 늦은 사건
      // F-21(AC-02/AC-05): **어느 소속이 빠졌는가**를 함께 본다. uuid만 보고 지우면, 그 계정이
      // 곧바로 다시 들어온 경우(추방→재입장, 이탈→재입장) 늦게 도착한 이 사건이 방금 성립한
      // 새 참가자를 화면에서 지운다. 서버가 소속 식별자를 싣지 않는 구버전 사건은 예전처럼
      // uuid만으로 처리한다.
      if (typeof membershipId === "string" && membershipId.length > 0) {
        // matchingStore는 방 상태를 **최상위 필드**로 들고 있다(room 객체가 없다) — players를
        // 그대로 읽는다. 여기서 없는 경로를 읽으면 이 소속 검사가 조용히 통과해 버린다.
        const seated = useMatchingStore.getState().players?.find((player) => player.uuid === uuid)
        // 이 화면이 그 소속을 **지금 들고 있을 때만** 적용한다. 이미 빠져 명단에 없거나
        // (같은 사건의 재전달·추방 뒤 도착한 늦은 이탈) 같은 계정의 다른 소속이면, 이 사건은
        // 이 화면이 이미 지나온 과거다 — 그대로 통과시키면 함께 실린 **옛 canStart**가 그 뒤에
        // 반영된 더 새로운 인원·준비 집계를 되돌린다(제거 자체는 이미 끝나 무해해 보이지만
        // canStart는 그렇지 않다).
        if (!seated) return
        if (typeof seated.membershipId === "string" && seated.membershipId !== membershipId) return
      }
      readyAggregateGenerationRef.current += 1
      applyRoomEvent(() => removePlayer(uuid, canStart))
    }
    const handleHostChanged = ({
      hostUuid, canStart, roomId: eventRoomId, settingsVersion, roomInstanceId, bootEpoch,
    }) => {
      if (!isCurrentSource()) return
      if (eventRoomId !== undefined && eventRoomId !== roomId) return // 다른 방의 늦은 사건
      /**
       * F-21(AC-05): roomId만으로는 **같은 식별자로 다시 만들어진 방**을 구별하지 못한다.
       *
       * 나갔다(추방당했다) 같은 방에 다시 들어오거나 서버가 재시작한 뒤라면, 그 사이에 발행된
       * 옛 host_changed가 지금 화면에 도착할 수 있다. roomId가 같으니 여기를 통과하고, 함께
       * 실린 **옛 canStart**가 그 뒤에 반영된 더 새로운 인원·준비 집계를 되돌린다(방장 표시도
       * 이전 방의 것으로 바뀐다). 서버는 이 두 값을 모든 host_changed에 싣는다 —
       * player_left_room·추방 사건이 쓰는 것과 같은 신원이다.
       *
       * 값을 싣지 않는 구버전 사건은 예전처럼 roomId만으로 처리한다(조용히 막지 않는다).
       */
      const identity = useMatchingStore.getState()
      if (typeof roomInstanceId === "string" && typeof identity.roomInstanceId === "string"
        && roomInstanceId !== identity.roomInstanceId) return
      if (typeof bootEpoch === "string" && typeof identity.bootEpoch === "string"
        && bootEpoch !== identity.bootEpoch) return
      applyRoomEvent(() => updateHost(hostUuid, canStart))
      // F-20(AC-05): 방장이 바뀌면 이전 방장의 편집 초안은 더 이상 유효한 시작점이 아니다.
      // 서버가 알려준 버전이 우리가 아는 것과 다르면 최신 설정을 다시 확보한다 — 같은
      // 버전이어도 방장·준비는 달라질 수 있으므로 버전만으로 신선도를 단정하지 않는다.
      const known = useMatchingStore.getState().settingsVersion
      if (settingsVersion !== undefined && settingsVersion !== known) requestRoomResync()
    }
    // F-20(AC-03/AC-04): 설정 변경 스냅샷은 설정·참가자 준비·canStart를 한 번에 적용한다.
    const handleRoomSettingsUpdated = (payload) => {
      if (!isCurrentSource()) return
      if (!payload || payload.roomId !== roomId) return // 다른 방의 늦은 사건은 적용하지 않는다
      // 이 스냅샷은 설정만 싣고 있지 않다 — 같은 버전 시점의 **명단·준비·방장·canStart**를 통째로
      // 싣는다. 그래서 "설정이 같으니 다시 적용해도 무해하다"가 성립하지 않는다. 적용 여부는
      // 서버가 보장하는 단조 증가 값(settingsVersion — 실제 설정 교체에서만 오른다)으로 판정한다.
      const known = useMatchingStore.getState().settingsVersion
      const incoming = payload.settingsVersion
      if (Number.isSafeInteger(incoming) && Number.isSafeInteger(known)) {
        // 우리가 아는 것보다 낮은 버전은 이 화면이 이미 지나온 과거다. 그대로 적용하면 설정뿐
        // 아니라 그 안의 명단·준비까지 함께 되돌아간다.
        if (incoming < known) return
        // 같은 버전은 **설정에 대해서는** 우리가 이미 아는 것과 같은 사실이고(서버는 값이 실제로
        // 달라질 때만 버전을 올린다), 명단·준비·방장에 대해서는 아무 새 정보도 아니다 — 그 버전이
        // 확정된 **뒤에** 일어난 준비 변경·방장 이전은 이 스냅샷에 담겨 있지 않다. 다시 적용하면
        // 그 사이에 받은 더 새로운 준비 상태가 조용히 옛 값으로 되돌아간다.
        if (incoming === known) return
      }
      // 이 방송 이후에 도착하는 "그 이전에 발행된" 전체 방 조회가 이 스냅샷을 덮지 못하게
      // 한다(usePublicRooms의 적용 세대와 같은 원리).
      // 설정 교체 스냅샷은 전원 준비 해제까지 함께 싣는다 — 준비에 관한 사실이므로, 이 시점
      // 이전에 발행된 준비 ACK의 방 전체 집계는 이것을 보지 못했다.
      readyAggregateGenerationRef.current += 1
      applyRoomEvent(() => applyRoomSettings(payload))
    }
    // 다른 참가자의 준비 상태 변경 알림이다. 본인의 변경은 setReady의 ack 응답으로 반영한다
    // (자기 자신에게는 이 이벤트가 오지 않는다 — 서버가 socket.to(roomId)로만 방송한다).
    const handlePlayerReadyChanged = ({
      uuid, isReady, canStart, sfxEvent, roomId: eventRoomId, settingsVersion, readyRevision,
    }) => {
      if (!isCurrentSource()) return
      if (eventRoomId !== undefined && eventRoomId !== roomId) return // 다른 방의 늦은 사건
      // 이미 더 새로운 설정 스냅샷이나 더 새로운 준비 사실을 반영했다면 이 사건은 과거다 —
      // 표시도 소리도 내지 않는다(소리만 남으면 없는 변경을 알리게 된다).
      const verdict = classifyReadyEvent(useMatchingStore.getState(), uuid, { settingsVersion, readyRevision })
      if (verdict === READY_EVENT.STALE) return
      if (verdict === READY_EVENT.NEWER) {
        // 우리가 아직 보지 못한 설정에서 온 사건이다. 그 값을 그대로 믿지 않고 최신 상태를
        // 서버에서 다시 확보한다(재조회 자체가 제한된 시리즈다).
        requestRoomResync()
        return
      }
      // 업무 상태를 먼저 반영하고, 그 뒤에 독립적으로 소리를 낸다 — 소리의 성공·실패·지연이
      // 준비 표시 갱신에 영향을 주지 않는다(AC-06).
      // 다른 참가자의 준비가 실제로 바뀌었다 — 이 사실을 입력으로 삼지 못한 방 전체 집계는
      // 이제 낡은 것이다(내 준비 ACK가 싣고 오는 canStart가 바로 그런 집계일 수 있다).
      readyAggregateGenerationRef.current += 1
      applyRoomEvent(() => setPlayerReady(uuid, isReady, canStart, readyRevision))
      playRoomSfx('room-ready-changed', sfxEvent)
    }
    const handleRoomDeleted = () => {
      // 이미 남이 된 연결의 "방이 사라졌다"는 지금 이 화면을 이동시킬 근거가 아니다.
      if (!isCurrentSource()) return
      // 서버가 "이 방은 사라졌다"를 확정한 사건이다 — 소속 교체를 다시 물을 이유가 없다.
      applyVerifiedRoom(clearRoom)
      onRoomDeleted?.()
    }
    // 서버 handleStartGame이 참가자 각자에게 개인화된 payload로 실제 보내는 이벤트다.
    const handleGameStarted = (payload) => {
      // 옛 연결·이전 계정의 시작 사건으로 인게임 세션을 만들지 않는다(잠금도 건드리지 않는다 —
      // 그 잠금은 이미 소속·세대 교체 경계에서 풀렸거나 지금 요청의 것이다).
      if (!isCurrentSource()) return
      clearStartState()
      // 서버 payload에는 hostUuid가 없다. 바로 아래 clearRoom()이 방 상태를 지우므로, 그 전에
      // 지금 방의 방장을 읽어 이 게임 세션의 값으로 함께 넘긴다 — 인게임 설정의 방관리 탭이
      // 읽는 방장 정보는 이 경로로만 들어오고 세션과 함께 사라진다(ingameStore.hostUuid 참고).
      const { hostUuid } = useMatchingStore.getState()
      useInGameStore.getState().setGamePayload({ ...payload, hostUuid })
      // 게임이 시작돼 대기방이 사라진 것도 서버가 확정한 사실이다. 여기서 소속 재확인을 걸면
      // 그 조회가 "방 없음"을 다시 확정해 방금 시작한 인게임 이동을 대기방 이탈로 덮어쓴다.
      applyVerifiedRoom(clearRoom)
      onGameStarted?.(payload)

      // F-16(AC-01/AC-04): 시작음은 한 게임당 1회다. store 반영 뒤 canonical gameId를 직접
      // 읽어 사건 ID를 만든다 — 이 값이 곧 재생기의 현재 게임 범위이므로, 위 clearRoom()으로
      // 방이 사라진 뒤에도 게임 범위는 이미 확보돼 있다. get_current_room 복원 경로는 이
      // 핸들러를 거치지 않으므로 복원으로는 시작음이 나지 않는다(A-05).
      const gameId = useInGameStore.getState().gameId
      const { user, isLoggedIn } = useAuthStore.getState()
      const accountId = isLoggedIn && user?.uuid ? user.uuid : null
      if (typeof gameId === 'string' && gameId.length > 0 && accountId !== null) {
        dispatchSfxEvent({
          kind: 'game-started',
          eventId: `game:${gameId}:started`,
          accountId,
          gameId,
          origin: payload?.sfxEvent?.origin ?? payload?.origin ?? 'live',
        })
      }
    }

    socket.on('player_joined_room', handlePlayerJoinedRoom)
    socket.on('player_left_room', handlePlayerLeftRoom)
    socket.on('host_changed', handleHostChanged)
    socket.on('player_ready_changed', handlePlayerReadyChanged)
    socket.on('room_deleted', handleRoomDeleted)
    socket.on('game_started', handleGameStarted)
    socket.on(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, handleRoomSettingsUpdated)

    // cleanup: effect가 재실행되기 직전이나 컴포넌트가 사라질 때 호출되어
    // 이전에 등록한 리스너를 정리합니다. 이게 없으면 roomId가 바뀔 때마다
    // 이벤트 핸들러가 중복 등록되어 같은 이벤트가 여러 번 처리될 수 있습니다.
    // 각 off는 등록할 때와 동일한 함수 참조로 호출한다 — event명만으로 off하면 같은
    // 이벤트에 대한 다른 구독자의 리스너까지 함께 지워질 수 있다.
    return () => {
      // 소유권을 먼저 내려놓는다 — 아래 off가 도는 사이에도 이 핸들러들은 더 이상 지금
      // 화면의 것이 아니다. 해제는 등록할 때와 **같은 참조로 자기 리스너만** 걷는다.
      owned = false
      socket.off('player_joined_room', handlePlayerJoinedRoom)
      socket.off('player_left_room', handlePlayerLeftRoom)
      socket.off('host_changed', handleHostChanged)
      socket.off('player_ready_changed', handlePlayerReadyChanged)
      socket.off('room_deleted', handleRoomDeleted)
      socket.off('game_started', handleGameStarted)
      socket.off(SOCKET_EVENTS.ROOM_SETTINGS_UPDATED, handleRoomSettingsUpdated)
    }
  }, [socket, roomId, roomEventGeneration, onRoomDeleted, onGameStarted])

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

    // 이 소켓 참조가 처음 보이는 것이면 지금 로그인한 계정을 그 연결의 신원으로 각인한다.
    // 같은 소켓으로 effect가 다시 도는 경우(onRoomDeleted 교체 등)에는 다시 찍지 않는다 —
    // 그러면 이전 계정의 연결이 새 신원의 것으로 둔갑한다.
    if (socketIdentityRef.current.socket !== socket) {
      socketIdentityRef.current = { socket, uuid: useAuthStore.getState().user?.uuid ?? null }
    }
    /** 이 연결이 **지금 로그인한 그 계정으로** 인증된 것인가. */
    const isConnectionIdentityCurrent = () =>
      socketIdentityRef.current.socket === socket
      && socketIdentityRef.current.uuid === (useAuthStore.getState().user?.uuid ?? null)

    // 이 effect 인스턴스(현재 socket)에 속한 모든 진행 중 요청·예약된 timer를 무효화하는 데
    // 쓰는 지역 변수들이다. socket이 바뀌거나 컴포넌트가 사라지면 cleanup에서 즉시 갱신된다.
    let cancelled = false
    let retryTimer = null
    let activeSeriesId = 0
    let activeRequestVersion = 0
    // F-20(AC-05): 지금 서버 응답을 기다리는 get_current_room이 있는지. 적용 세대가 올라가면
    // 그 응답은 버려지는데, 버리기만 하면 검증이 'checking'에 영원히 머문다 — 그 경우에만
    // 새 조회를 한 번 다시 건다(방송이 소속을 증명한다고 가정하지 않는다).
    let checkInFlight = false

    /**
     * F-20(AC-05): **이 조회가 확보한 사실보다 오래된 방 스냅샷을 전부 낡은 것으로 만든다.**
     *
     * 소속이 갈리는 경우는 소속 세대가 잡아내지만, 서버가 **같은 방**을 그대로 확인해 준
     * 응답은 roomId·계정·소켓이 전부 그대로라 어떤 값으로도 구별되지 않는다. 그런데 그
     * 응답은 이 조회가 떠난 뒤의 사실까지 담은 최신 상태다 — 설정 버전이 올랐을 수도 있고,
     * 같은 버전 위에서 방장·준비만 바뀌었을 수도 있다. 이 조회보다 **먼저** 떠난 저장 실패
     * 응답·결과 조회 응답은 자기 요청 시점의 방을 함께 싣고 오므로, 세대를 올려 두지 않으면
     * 그 옛 스냅샷이 방금 확보한 최신 상태를 조용히 덮는다.
     *
     * bumpRoomApplyGeneration을 쓰지 않고 카운터만 올린다 — 그쪽은 진행 중인 조회가 있으면
     * 새 시리즈를 시작하는데, 여기서 "진행 중인 조회"는 방금 성공한 이 요청 자신이라
     * 성공할 때마다 조회가 한 번 더 도는 재귀가 된다.
     */
    const markRoomStateAdvanced = () => { roomApplyGenerationRef.current += 1 }
    // "확인 에피소드"(최초 연결/재연결/소켓 교체/확인 성공마다 새로 시작)당 confirm을 1회만
    // 띄우기 위한 플래그다. effect 전체 수명 동안 한 번만 true로 고정되지 않는다(5절 정책).
    let hasPromptedRetry = false

    // 현재 활성 시리즈에 속한 모든 진행 중 요청·예약된 재시도 timer를 무효화한다.
    // effect cleanup과 disconnect 처리 둘 다 "지금 하던 확인 작업을 전부 버린다"는
    // 같은 일을 하므로 이 지역 함수 하나로 공유한다(범용 유틸로 분리하지 않음).
    const invalidateActiveCheck = () => {
      activeSeriesId += 1
      activeRequestVersion += 1
      checkInFlight = false
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
      // F-20: 설정 저장도 같은 순간에 무효화한다. 잠금은 풀되 pendingSettingsRequest는 지우지
      // 않는다 — 연결이 끊긴 것은 "저장이 실패했다"는 증거가 아니라 "확인할 수 없다"는 뜻이라,
      // 원 요청자는 재연결 뒤 같은 requestId로 결과를 다시 물어야 한다(A-07).
      settingsRequestVersionRef.current += 1
      // 진행 중이던 저장이 있었다면 그 요청을 **미확인 목록으로 승격**시킨다. 여기서 놓치면
      // 재연결한 방장은 새 requestId로 다시 저장하게 되고, 이미 커밋된 저장이 두 번 일어난다.
      const inFlightSave = inFlightSettingsRequestRef.current
      if (inFlightSave && mountedRef.current) {
        setPendingSettingsRequest((prev) => prev ?? inFlightSave)
        setSettingsError({
          code: ROOM_SETTINGS_ERROR_CODES.UNKNOWN,
          message: ROOM_SETTINGS_ERROR_MESSAGES.RESULT_UNKNOWN,
        })
        // 여기서 이 요청의 **소유권이 넘어간다**. 미확정 상태는 이제 pendingSettingsRequest가
        // 들고 있고, 그 결말은 결과 조회가 확정한다(확정되면 pending이 내려간다). 진행 중
        // 표시를 그대로 남겨 두면 그 확정 뒤에 다시 끊길 때 이미 끝난 요청이 또 승격되어,
        // 방장은 결말을 확인했는데도 편집이 다시 잠긴 채 같은 요청을 또 묻게 된다.
        // 넘긴 바로 그 요청일 때만 내린다 — 그 사이 시작된 더 새로운 저장의 것이면 그
        // 저장은 아직 진행 중이므로 자기 승격 기회를 잃으면 안 된다.
        if (inFlightSettingsRequestRef.current === inFlightSave) {
          inFlightSettingsRequestRef.current = null
        }
      }
      roomApplyGenerationRef.current += 1
      clearStartState()
      clearReadyState()
      clearSettingsState()
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
      // F-16(AC-01): 이 대화상자의 **반환 경계**가 확인/취소음의 단일 소유자다. 위의
      // series/hasPromptedRetry 가드를 이미 통과한 뒤이므로, 오래된 시리즈의 실패나 같은
      // 에피소드의 중복 prompt에는 소리가 나지 않는다(그 경로는 여기 도달하지 않는다).
      // 이 대화상자는 클릭이 아니라 네트워크 실패가 띄우므로 겹칠 일반 클릭음도 없다.
      const confirmed = window.confirm('방 상태를 확인하지 못했습니다. 다시 확인하시겠습니까?')
      dispatchUiSfx(confirmed ? 'ui-confirm' : 'ui-cancel')
      if (confirmed) {
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
      // 신원이 이미 갈렸는데 연결은 아직 이전 계정의 것이다. 이 통로로 물으면 서버는 그 소켓의
      // 인증 신원(= 이전 계정)으로 답하므로, 그 응답은 지금 계정의 소속에 대한 증거가 될 수
      // 없다. 조회 자체를 보내지 않고 기다린다 — useSocket이 새 쿠키로 연결을 교체하면 이
      // effect가 다시 돌면서 그 통로로 새 시리즈를 시작한다.
      if (!isConnectionIdentityCurrent()) {
        setRoomSyncStatus('waiting_socket')
        return
      }

      activeRequestVersion += 1
      const requestVersion = activeRequestVersion
      const requestSocket = socket
      const requestRoomId = useMatchingStore.getState().roomId
      const requestUuid = useAuthStore.getState().user?.uuid
      // F-20(AC-05): 이 조회가 근거로 삼은 적용 세대. 응답이 돌아왔을 때 세대가 올라가 있다면
      // 그 사이에 설정 방송·소속 변경·계정 전환이 있었다는 뜻이므로 이 응답은 버린다.
      const requestApplyGeneration = roomApplyGenerationRef.current
      // F-20(AC-05): **소속 세대**도 함께 캡처한다. R1→R2→R1이나 R1→방 없음→R1은 roomId·계정·
      // 소켓·설정 버전이 전부 요청 시점과 같아져 위 값들만으로는 구별되지 않는다 — 그 사이
      // 서버가 준 새 스냅샷을, 그보다 먼저 떠난 조회가 옛 값(또는 "방 없음")으로 덮는다.
      const requestMembership = roomMembershipGenerationRef.current

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
        useAuthStore.getState().user?.uuid !== requestUuid ||
        roomApplyGenerationRef.current !== requestApplyGeneration ||
        roomMembershipGenerationRef.current !== requestMembership

      checkInFlight = true
      requestSocket.timeout(CURRENT_ROOM_CHECK_TIMEOUT_MS).emitWithAck('get_current_room', {})
        .then((response) => {
          if (requestVersion === activeRequestVersion) checkInFlight = false
          if (isStale()) return

          if (!response?.ok) {
            settleFailed(seriesId)
            return
          }

          if (response.room) {
            // 서버가 현재 Room이 있음을 확인했다 — payload 전체로 store를 최신화한다.
            // 이 응답 자체가 이 소속의 권위 있는 근거이므로, 여기서 소속이 바뀌더라도
            // (최초 발견 null→방, 서버가 알려준 다른 방) 재확인을 새로 걸지 않는다.
            applyVerifiedRoom(() => useMatchingStore.getState().setRoom(response.room))
            markRoomStateAdvanced()
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
          // 결과 화면 → 매칭 대기(방장 재생성) 중에는 소속 없음이 정상이다 — store를 지우거나
          // onRoomDeleted를 부르면 방금 성공한 파티 재입장까지 되돌릴 수 있다.
          if (awaitPartyRoomRejoinRef.current && !useMatchingStore.getState().isInRoom) {
            if (mountedRef.current) setRoomSyncStatus('verified')
            return
          }
          applyVerifiedRoom(() => useMatchingStore.getState().clearRoom())
          markRoomStateAdvanced()
          onRoomDeleted?.() // 곧 이 컴포넌트가 언마운트되므로 별도의 "no_room" 지속 상태는 두지 않는다.
        })
        .catch(() => {
          if (requestVersion === activeRequestVersion) checkInFlight = false
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

    // 이벤트 effect(설정 변경·방장 이전 수신)가 이 시리즈를 다시 시작하거나 적용 세대를
    // 올릴 수 있게 연결한다. 두 effect를 합치지 않는 이유는 기존 주석과 같다.
    bumpRoomApplyGenerationRef.current = () => {
      roomApplyGenerationRef.current += 1
      // 세대를 올리면 **진행 중이던** 조회의 응답은 도착해도 버려진다. 그 조회가 검증
      // 시리즈였다면 여기서 끝내 주지 않는 한 상태가 'checking'에 갇힌다 — 방송 하나를
      // 소속의 증거로 승격시키는 대신, 같은 에피소드 안에서 새 조회를 한 번 다시 건다.
      if (!cancelled && checkInFlight) startCheckSeries({ resetPromptState: false })
    }
    requestRoomResyncRef.current = () => {
      if (cancelled) return
      roomApplyGenerationRef.current += 1
      startCheckSeries({ resetPromptState: false })
    }
    /**
     * F-20(AC-05): 소속이 갈렸다 — 이 소속만을 위한 **권위 있는 조회**를 새로 건다.
     *
     * 이전 소속의 검증 결과(verified)를 물려받으면 준비·시작·저장이 한 번도 확인한 적 없는
     * 방에 대해 열린다. 반대로 진행 중이던 조회를 버리기만 하면(그 응답은 소속 세대가 달라
     * isStale로 폐기된다) 검증이 'checking'에 갇힌 채 아무 조회도 남지 않는다. 그래서 버리는
     * 것과 새로 거는 것을 한 경계에서 함께 한다. 연결이 없으면 runCheckAttempt가
     * waiting_socket으로 되돌리고, 재연결·online이 새 시리즈를 다시 시작한다.
     */
    invalidateRoomVerificationRef.current = () => {
      if (cancelled) return
      roomApplyGenerationRef.current += 1
      startCheckSeries({ resetPromptState: false })
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
      bumpRoomApplyGenerationRef.current = null
      requestRoomResyncRef.current = null
      invalidateRoomVerificationRef.current = null
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

  // F-20(AC-05): 계정이 바뀌면(로그아웃·재로그인·계정 전환) 이전 계정의 방·설정·편집 초안·
  // 요청 결과 상태를 남기지 않는다. roomId 비교만으로는 같은 방에 다른 계정이 들어온 경우를
  // 구분할 수 없어, 적용 세대를 올려 진행 중이던 응답까지 함께 무효화한다.
  useEffect(() => {
    const unsubscribe = useAuthStore.subscribe((state, prevState) => {
      const nextUuid = state?.user?.uuid ?? null
      const prevUuid = prevState?.user?.uuid ?? null
      if (nextUuid === prevUuid) return
      roomApplyGenerationRef.current += 1
      // 계정이 갈리면 방 안에 있지 않았더라도(roomId가 계속 null이어도) 소속 자체가 다른
      // 사람의 것이 된다 — store 구독만으로는 그 경우가 잡히지 않으므로 여기서 함께 올린다.
      roomMembershipGenerationRef.current += 1
      setRoomEventGeneration(roomMembershipGenerationRef.current)
      settingsRequestVersionRef.current += 1
      // 계정이 바뀌면 이전 계정의 저장 요청은 "미확인"이 아니라 **적용될 수 없는 것**이다 —
      // 단절과 달리 여기서는 붙잡아 두지 않는다(다른 계정이 그 결과를 묻게 해서는 안 된다).
      inFlightSettingsRequestRef.current = null
      clearSettingsState()
      // 시작·준비도 같은 경계를 지난다(방 변경 구독과 같은 이유).
      startRequestVersionRef.current += 1
      readyRequestVersionRef.current += 1
      clearStartState()
      clearReadyState()
      if (!mountedRef.current) return
      setPendingSettingsRequest(null)
      setSettingsError(null)
      // 이전 계정의 "확인하지 못했다"는 안내도 함께 내린다 — 다른 계정에게 보여줄 결론이 아니다.
      setSettingsResultNotice(null)
      // 계정이 갈려서 방을 비우는 것은 이 훅이 내리는 확정 판단이다. 아래 소속 구독이 이것을
      // "확인이 필요한 소속 교체"로 오해해 지금 계정도 아닌 신원으로 조회를 걸면 안 된다.
      applyVerifiedRoom(() => useMatchingStore.getState().clearRoom())

      // 이전 계정에서 받은 **검증 자체**도 이 신원의 것이 아니다. 그대로 두면 한 번도 확인한
      // 적 없는 신원에서 준비·시작·저장이 곧바로 열린다(세 경로 모두 roomSyncStatus만 본다).
      // 반대로 확인 중이던 조회는 신원이 달라 폐기되는데, 새 조회를 걸지 않으면 검증이
      // 'checking'에 갇힌 채 아무도 그것을 끝내 주지 않는다 — 소켓 교체가 아예 일어나지 않는
      // A→B→A에서는 동기화 effect가 다시 돌 계기조차 없다.
      //
      // 그래서 내리는 것과 이 신원의 조회를 새로 거는 것을 함께 한다. 다만 그 조회가 실제로
      // 나가는지는 위 신원 가드가 정한다 — 아직 이전 계정의 연결뿐이면 waiting_socket으로
      // 되돌아가고, 지금도 이 계정으로 인증된 연결이면(A→B→A) 그 통로로 정상 확인한다.
      if (invalidateRoomVerificationRef.current) invalidateRoomVerificationRef.current()
      else setRoomSyncStatus('waiting_socket')
    })
    return () => unsubscribe?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // F-20(AC-05): 방을 떠나거나 다른 방으로 옮기면 그 방에 묶인 저장 요청도 더 이상 적용될 수
  // 없다. 단절(같은 방·같은 계정으로 돌아옴)과 구분해, 여기서만 미확인 요청을 내린다 —
  // 그렇지 않으면 새 방에서 옛 방의 결과를 묻고 그 응답으로 화면을 갱신하게 된다.
  useEffect(() => {
    const unsubscribe = useMatchingStore.subscribe((state, prevState) => {
      if (state.roomId === prevState.roomId) return
      // 소속이 한 번이라도 갈리면 그 이전에 시작된 저장·결과 조회는 전부 지난 소속의 것이다.
      // R1→R2→R1처럼 값이 되돌아오는 경우까지 구분하려면 단조 증가 세대가 유일한 근거다.
      roomMembershipGenerationRef.current += 1
      setRoomEventGeneration(roomMembershipGenerationRef.current)
      // 그 요청들의 세대도 함께 무효화하고 잠금을 푼다(단절 처리와 같은 이유·같은 방식).
      // 풀지 않으면 새 방의 방장은 지난 소속의 응답이 도착할 때까지 저장 자체를 시작할 수
      // 없고, 그 지난 요청의 finally가 나중에 새 요청의 잠금을 대신 풀게 된다.
      settingsRequestVersionRef.current += 1
      inFlightSettingsRequestRef.current = null
      clearSettingsState()
      // 시작·준비도 **같은 경계**를 지나야 한다. 소속이 갈리면 그 요청들도 지난 소속의
      // 것이고, 잠금을 풀지 않으면 새 소속에서는 요청 자체가 시작되지 않는다
      // (isStartingRef/isSettingReadyRef의 진입 가드에 걸린다).
      startRequestVersionRef.current += 1
      readyRequestVersionRef.current += 1
      clearStartState()
      clearReadyState()
      if (!mountedRef.current) return
      setPendingSettingsRequest((prev) => (prev && prev.roomId !== state.roomId ? null : prev))
      // 지난 소속의 저장 결과 안내는 새 소속의 화면에 남기지 않는다.
      setSettingsResultNotice(null)

      // F-20(AC-05): 세대를 올리고 잠금을 푸는 것만으로는 부족하다. roomSyncStatus는 **이전
      // 소속에서** 'verified'가 된 값이라, 그대로 두면 한 번도 확인한 적 없는 새 소속에서
      // 준비·시작·저장이 곧바로 열린다(세 경로 모두 roomSyncStatus === 'verified'만 본다).
      // 반대로 확인 중이던 조회는 소속 세대가 달라 폐기되므로, 새 조회를 걸지 않으면 검증이
      // 'checking'에 갇힌다. 그래서 상태를 내리는 것과 이 소속의 조회를 새로 거는 것을 함께 한다.
      //
      // 다만 그 교체 자체가 권위 있는 응답에서 왔다면(최초 방 발견·room_deleted·game_started·
      // 계정 전환) 그 응답이 이미 이 소속의 근거다 — 다시 묻지 않는다. 그러지 않으면 최초 방
      // 발견마다 조회가 한 번 더 돌고, 방이 사라진 뒤의 여분 조회가 진행 중인 화면 이동을 덮는다.
      if (applyingVerifiedRoomRef.current) return
      if (invalidateRoomVerificationRef.current) invalidateRoomVerificationRef.current()
      else setRoomSyncStatus('waiting_socket')
    })
    return () => unsubscribe?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
      setStartBlockedMessage(SOCKET_UNAVAILABLE_MESSAGE)
      return
    }
    if (roomSyncStatus !== 'verified') {
      // 버튼은 항상 누를 수 있게 두고, 미검증 소속에서는 요청 대신 모달로만 안내한다.
      setStartBlockedMessage(GAME_START_MESSAGES.ROOM_SYNC_PENDING)
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
    const { roomId: requestRoomId, settingsVersion: requestSettingsVersion } = useMatchingStore.getState()
    const requestUuid = useAuthStore.getState().user?.uuid
    // F-20(AC-04/AC-05): 이 요청이 묶여 있는 **소속**. roomId가 같은 값으로 되돌아와도
    // (R1→R2→R1, R1→방 없음→R1) 그 사이의 소속 교체를 단조 증가 세대가 구별해 준다.
    const requestMembership = roomMembershipGenerationRef.current
    // F-20(AC-04): 어느 방·어느 설정 버전을 보고 눌렀는지는 시작 요청의 필수 근거다. 아직
    // 확보하지 못했다면 요청 자체를 보내지 않는다 — 서버가 현재 값으로 채워 주지 않으므로
    // 빈 값을 보내면 그대로 거부될 뿐이고, 사용자에게는 이유를 알 수 없는 실패로 보인다.
    if (!requestRoomId || !Number.isSafeInteger(requestSettingsVersion)) {
      setStartBlockedMessage(GAME_START_MESSAGES.ROOM_SYNC_PENDING)
      return
    }
    const isStaleResponse = () => {
      if (!mountedRef.current) return true
      if (requestVersion !== startRequestVersionRef.current) return true
      if (requestMembership !== roomMembershipGenerationRef.current) return true
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
      const response = await socket.timeout(START_GAME_TIMEOUT_MS).emitWithAck('start_game', {
        roomId: requestRoomId,
        expectedSettingsVersion: requestSettingsVersion,
      })
      if (isStaleResponse()) return

      if (!response?.ok) {
        // 그 사이 설정이 바뀌어 이 요청의 근거가 사라진 경우다 — 실패를 알리기 전에 최신
        // 상태를 다시 확보한다(방송을 놓쳤을 수도 있으므로 조회로 회복한다).
        if (response?.code === 'ROOM_STATE_CHANGED') requestRoomResync()
        setStartBlockedMessage(response?.message ?? GAME_START_MESSAGES.FALLBACK)
      }
      // response.ok는 이번 슬라이스에서 항상 false다(GAME_CORE_NOT_READY 등). 실제 성공은
      // 다음 GameSession 슬라이스에서 game_started 방송으로 처리되며, 그 경로는 위의
      // handleGameStarted가 별도로 clearStartState를 호출해 잠금을 해제한다.
    } catch {
      // socket.timeout()이 던지는 타임아웃 오류다 — 서버가 보낸 구체적인 실패 사유가 아니므로
      // 일반 실패 메시지와 구분해 안내한다.
      if (!isStaleResponse()) setStartBlockedMessage(GAME_START_MESSAGES.REQUEST_TIMEOUT)
    } finally {
      // 이 요청이 아직 자기 세대를 소유하고 있을 때만 잠금을 해제한다. 그사이 disconnect 등으로
      // invalidateActionRequests가 세대를 이미 올리고 잠금도 풀어놨다면(또는 그 뒤 사용자가
      // 새 요청을 또 시작했다면) 여기서는 아무것도 하지 않는다 — 그래야 이 늦은 finally가
      // 이후에 시작된 새 요청의 잠금을 실수로 풀어버리는 일이 생기지 않는다.
      // 소속이 갈렸다면 이 요청은 이미 지난 소속의 것이다(세대 교체가 잠금도 함께 풀었다).
      if (requestVersion === startRequestVersionRef.current
        && requestMembership === roomMembershipGenerationRef.current) {
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
    const { roomId: requestRoomId, settingsVersion: requestSettingsVersion } = useMatchingStore.getState()
    const requestUuid = useAuthStore.getState().user?.uuid
    // F-20(AC-04/AC-05): 이 요청이 묶여 있는 소속(startGame과 같은 이유·같은 경계).
    const requestMembership = roomMembershipGenerationRef.current
    // F-20(AC-04): 이 요청이 근거로 삼은 **준비 집계 세대**. ACK의 own outcome(내 준비 값·내
    // revision)과 달리 canStart는 모든 참가자의 준비를 입력으로 삼는 집계라, 요청을 보낸 뒤
    // 준비에 관한 사실을 한 번이라도 반영했다면 이 ACK의 집계는 그것을 보지 못한 것일 수 있다.
    const requestReadyAggregate = readyAggregateGenerationRef.current
    // F-20(AC-04): 방·설정 버전은 준비 요청의 필수 근거다(startGame과 같은 이유).
    if (!requestRoomId || !Number.isSafeInteger(requestSettingsVersion)) {
      alert('현재 방 상태를 확인하고 있습니다. 잠시 후 다시 시도해주세요.')
      return
    }
    const isStaleResponse = () => {
      if (!mountedRef.current) return true
      if (requestVersion !== readyRequestVersionRef.current) return true
      if (requestMembership !== roomMembershipGenerationRef.current) return true
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
      // F-20(AC-04): 어느 방·어느 설정 버전을 보고 눌렀는지 함께 보낸다. 저장 직전에 발행된
      // 준비 요청이 늦게 도착해 새 설정의 전원 해제를 되돌리는 일을 서버가 막을 수 있다.
      const response = await socket.timeout(SET_READY_TIMEOUT_MS).emitWithAck('set_ready', {
        isReady,
        roomId: requestRoomId,
        expectedSettingsVersion: requestSettingsVersion,
      })
      if (isStaleResponse()) return

      if (response?.ok) {
        // F-20(AC-04): 성공 ACK라도 **지금 화면이 아는 사실보다 과거**일 수 있다. 이 요청을
        // 보낸 뒤 설정 변경 방송이 도착해 전원 준비가 해제됐다면, 그 ACK를 그대로 반영하는
        // 순간 해제 스냅샷이 조용히 되돌아간다. 방·설정 버전·준비 revision을 함께 대조한다.
        const current = useMatchingStore.getState()
        if (response.roomId !== undefined && response.roomId !== current.roomId) return
        const verdict = classifyReadyEvent(current, requestUuid, {
          settingsVersion: response.settingsVersion, readyRevision: response.readyRevision,
        })
        if (verdict === READY_EVENT.STALE) return
        if (verdict === READY_EVENT.NEWER) {
          // 내 요청의 ACK라도 우리가 아직 보지 못한 설정 위의 결과다 — 추측으로 반영하지 않고
          // 최신 상태를 다시 확보한다(방송 경로와 같은 판정이다).
          requestRoomResync()
          return
        }
        // F-20(AC-04): **내 준비 revision이 현재라는 것은 방 전체 집계가 현재라는 뜻이 아니다.**
        //
        // 위 판정(classifyReadyEvent)이 확인한 것은 이 ACK의 own outcome — 내 isReady와 내
        // readyRevision — 이 최신이라는 사실뿐이다. 같은 응답에 실린 canStart는 서버가 이 요청을
        // 처리한 **그 시점의** 방 전체 집계라, 그 사이 다른 참가자가 준비하거나 취소했다면(같은
        // 설정 버전에서 일어나므로 버전으로도 내 revision으로도 구별되지 않는다) 이미 과거다.
        // 그대로 반영하면 더 새로운 시작 권한을 지우거나, 이미 사라진 권한을 되살린다.
        const roomWideFresh = readyAggregateGenerationRef.current === requestReadyAggregate
        // own outcome은 어느 경우에도 잃지 않는다. canStart를 생략하면 store가 현재 값을
        // 그대로 둔다 — 방 전체 값에 대해 이 ACK는 아무 말도 하지 않는 것이 된다.
        current.setPlayerReady(
          requestUuid,
          response.isReady,
          roomWideFresh ? response.canStart : undefined,
          response.readyRevision,
        )
        if (roomWideFresh) {
          // F-20(AC-04): 내 준비가 실제로 반영된 순간도 **방 상태의 변경**이다. 세대를 올리지
          // 않으면, 이 변경 이전에 발행돼 아직 돌아오지 않은 전체 방 조회가 도착해 방금 반영한
          // 준비와 canStart를 옛 값으로 되돌린다(그 조회는 이 사실을 담고 있지 않다).
          bumpRoomApplyGeneration()
        } else {
          // 방 전체 값을 이 ACK로 정할 수 없다. 옛 집계를 그대로 두고 끝내면 시작 권한 표시가
          // 다음 사건까지 낡은 채로 굳고, 로컬에서 "전원 준비"를 세어 추측하면 서버의 입장
          // 조건(미확정 초대 입장 등)을 빠뜨린 권한을 만들어낸다 — 둘 다 하지 않고 권위 있는
          // 현재 방을 제한된 조회 한 번으로 다시 확보한다(이 호출이 세대도 함께 올린다).
          requestRoomResync()
        }
        // 요청자 본인의 준비 변경은 방송이 아니라 이 ACK로 들어온다(서버가 socket.to로만
        // 방송하므로 자기 자신에게는 오지 않는다). 상태를 반영한 뒤 독립적으로 소리를 낸다.
        // 같은 값 재요청(멱등 성공)에는 서버가 sfxEvent를 싣지 않으므로 소리도 나지 않는다.
        playRoomSfx('room-ready-changed', response.sfxEvent)
      } else if (response?.code === ROOM_SETTINGS_ERROR_CODES.SETTINGS_VERSION_CONFLICT) {
        // 그 사이 설정이 바뀌어 전원 준비가 해제됐다 — 실패를 알리기 전에 최신 상태를
        // 다시 확보한다(방송을 놓쳤을 수도 있으므로 조회로 회복한다).
        requestRoomResync()
        alert(response.message ?? '방 설정이 변경되었습니다. 최신 설정을 확인해주세요.')
      } else {
        alert(response?.message ?? '준비 상태를 변경하지 못했습니다.')
      }
    } catch {
      if (!isStaleResponse()) alert('준비 상태를 변경하지 못했습니다. 잠시 후 다시 시도해주세요.')
    } finally {
      // startGame과 동일하게, 이 요청이 아직 자기 세대·자기 소속을 소유할 때만 해제한다.
      if (requestVersion === readyRequestVersionRef.current
        && requestMembership === roomMembershipGenerationRef.current) {
        clearReadyState()
      }
    }
  }

  // ── F-20: 대기방 설정 저장과 결과 확인 ───────────────────────────────────
  //
  // requestId는 **한 번 만들어 재시도 내내 유지**한다 — 재시도마다 새로 만들면 서버가 그
  // 각각을 서로 다른 저장으로 보고, ACK를 놓친 요청의 결과를 다시 물을 수단이 사라진다.
  const createSettingsRequestId = () => {
    const random = globalThis.crypto?.randomUUID?.()
    // randomUUID가 없는 환경(구형 브라우저·테스트 jsdom)에서도 같은 요청을 두 번 만들지
    // 않도록 시간과 난수를 함께 쓴다. 서버는 이 값을 식별자로만 보고 형식을 강제하지 않는다.
    return random ?? `rs-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }

  /**
   * 폼 상태를 서버에 저장한다. 성공 판단은 전적으로 서버 ACK가 한다.
   *
   * @param {{checks:object, ranges:object, roleComposition:object, specifiedRoleNightActionTimes:string[]}} formState
   * @returns {Promise<{ok:boolean, code?:string, changed?:boolean}>}
   */
  const saveRoomSettings = async (formState) => {
    if (isSavingSettingsRef.current) return { ok: false, code: 'BUSY' }
    const socket = getSocket()
    if (!socket || !socket.connected || !window.navigator.onLine) {
      alert(SOCKET_UNAVAILABLE_MESSAGE)
      return { ok: false, code: 'OFFLINE' }
    }
    if (roomSyncStatus !== 'verified') {
      // 버튼 disabled와 별개로 실제 요청 경계를 여기서 다시 막는다(startGame과 같은 이유).
      alert('현재 방 상태를 확인하고 있습니다. 잠시 후 다시 시도해주세요.')
      return { ok: false, code: 'NOT_VERIFIED' }
    }
    // ACK를 잃은 이전 요청이 아직 미확인이면 새 저장을 만들지 않는다 — 그 결과를 먼저
    // 확정해야 "내가 무엇을 바꿨는가"가 하나로 남는다.
    if (pendingSettingsRequest) {
      alert(ROOM_SETTINGS_ERROR_MESSAGES.RESULT_UNKNOWN)
      return { ok: false, code: ROOM_SETTINGS_ERROR_CODES.UNKNOWN }
    }

    const { roomId: requestRoomId, settingsVersion, hostUuid } = useMatchingStore.getState()
    const requestUuid = useAuthStore.getState().user?.uuid
    // 방장이 아닌 상태에서는 요청 자체를 보내지 않는다(서버가 최종 판단을 다시 한다).
    if (!requestRoomId || !Number.isSafeInteger(settingsVersion) || hostUuid !== requestUuid) {
      return { ok: false, code: ROOM_SETTINGS_ERROR_CODES.NOT_HOST }
    }

    const requestId = createSettingsRequestId()
    const payload = buildUpdateRoomSettingsPayload({
      ...formState,
      roomId: requestRoomId,
      requestId,
      expectedSettingsVersion: settingsVersion,
    })

    settingsRequestVersionRef.current += 1
    const requestVersion = settingsRequestVersionRef.current
    const requestSocket = socket
    // 이 저장이 묶여 있는 소속과, 응답의 방 스냅샷이 신선한지 판정할 기준을 함께 캡처한다.
    const requestMembership = roomMembershipGenerationRef.current
    const requestApplyGeneration = roomApplyGenerationRef.current
    // 응답을 기다리는 동안 연결이 끊기면 invalidateActionRequests가 이 값을 미확인으로
    // 승격시킨다. 응답을 실제로 받으면 아래에서 내린다.
    inFlightSettingsRequestRef.current = { roomId: requestRoomId, requestId }
    const isStaleResponse = () => {
      if (!mountedRef.current) return true
      if (requestVersion !== settingsRequestVersionRef.current) return true
      if (requestSocket !== getSocket()) return true
      if (useAuthStore.getState().user?.uuid !== requestUuid) return true
      // 소속이 갈렸으면 이 응답(성공·실패·timeout 무엇이든)은 지금 방과 무관하다. 소켓 세대는
      // 단절만 보고 roomId 비교는 A→B→A를 구분하지 못한다 — 두 가지를 함께 본다.
      if (requestMembership !== roomMembershipGenerationRef.current) return true
      if (useMatchingStore.getState().roomId !== requestRoomId) return true
      return false
    }
    // 요청의 **정착**(서버가 무엇을 했는가)과 응답에 실린 **방 스냅샷의 신선도**는 다른
    // 사실이다. 정착은 소속이 같으면 유효하지만, 스냅샷은 그 사이에 더 새로운 사건을 이미
    // 반영했다면 적용하면 안 된다.
    const isRoomSnapshotFresh = () => roomApplyGenerationRef.current === requestApplyGeneration

    isSavingSettingsRef.current = true
    setIsSavingSettings(true)
    setSettingsError(null)
    // 새 저장을 시작했으므로 이전 저장의 "확인하지 못했다"는 결론은 더 이상 지금 화면의
    // 미해결 사항이 아니다(그 요청의 식별자는 이미 내려졌고, 이 저장은 새 요청이다).
    setSettingsResultNotice(null)
    try {
      const response = await requestSocket
        .timeout(UPDATE_ROOM_SETTINGS_TIMEOUT_MS)
        .emitWithAck(SOCKET_EVENTS.UPDATE_ROOM_SETTINGS, payload)
      if (isStaleResponse()) return { ok: false, code: 'STALE' }

      // 응답을 받았으므로 이 요청의 결과는 더 이상 미확인이 아니다 — 응답을 기다리는 사이
      // 잠깐 끊겼다 붙어 미확인으로 승격됐더라도 여기서 내린다(추측이 아니라 실제 응답이다).
      if (mountedRef.current) {
        setPendingSettingsRequest((prev) => (prev?.requestId === requestId ? null : prev))
      }

      if (response?.ok) {
        // 저장 성공의 화면 반영은 room_settings_updated 방송이 소유한다. 다만 방장 자신은
        // 그 방송을 확실히 받는다는 보장을 여기서 대신 세우지 않고, 버전만 먼저 맞춰 둔다.
        if (Number.isSafeInteger(response.settingsVersion)) {
          const current = useMatchingStore.getState()
          if (current.roomId === requestRoomId && (current.settingsVersion ?? 0) < response.settingsVersion) {
            requestRoomResync()
          }
        }
        return { ok: true, changed: response.changed === true }
      }

      // 버전 충돌·정원 하한 실패는 서버가 최신 방 상태를 함께 준다 — 그대로 반영해 방장이
      // 곧바로 최신값에서 다시 편집할 수 있게 한다(추측으로 되돌리지 않는다). 다만 이 스냅샷은
      // 요청 시점의 것이라, 그 뒤에 더 새로운 사건을 이미 반영했다면 적용하지 않는다.
      if (response?.room && isRoomSnapshotFresh()
        && useMatchingStore.getState().roomId === response.room.roomId) {
        useMatchingStore.getState().setRoom(response.room)
        bumpRoomApplyGeneration()
      } else if (revealsNewerSettingsVersion(response?.room)) {
        // 스냅샷을 통째로 적용하기에는 낡았다(그 사이의 준비·방장 변경을 되돌릴 수 있다).
        // 하지만 그 사이 끼어든 사건이 준비 방송이었다면 **설정**에 대해서는 새 정보가 아니고,
        // 이 거부 응답은 우리가 아직 모르는 더 새로운 설정 버전을 드러냈다. 그 사실을 버리면
        // 방장은 낡은 기대 버전으로 계속 저장을 시도하게 된다 — 최신 설정만 다시 확보한다.
        requestRoomResync()
      }
      setSettingsError({ code: response?.code ?? ROOM_SETTINGS_ERROR_CODES.INTERNAL_ERROR, message: response?.message })
      return { ok: false, code: response?.code }
    } catch {
      // timeout이다. "저장 실패"가 아니라 "결과를 모른다"로 다룬다 — 서버에는 이미 반영됐을
      // 수 있으므로 같은 requestId를 붙잡아 두고 결과를 다시 묻게 한다.
      if (!isStaleResponse()) {
        setPendingSettingsRequest({ roomId: requestRoomId, requestId })
        setSettingsError({ code: ROOM_SETTINGS_ERROR_CODES.UNKNOWN, message: ROOM_SETTINGS_ERROR_MESSAGES.RESULT_UNKNOWN })
      }
      return { ok: false, code: ROOM_SETTINGS_ERROR_CODES.UNKNOWN }
    } finally {
      // 이 요청은 더 이상 "진행 중"이 아니다. 미확인 여부는 위에서 이미 확정했다.
      if (inFlightSettingsRequestRef.current?.requestId === requestId) {
        inFlightSettingsRequestRef.current = null
      }
      if (requestVersion === settingsRequestVersionRef.current) clearSettingsState()
    }
  }

  /**
   * ACK를 잃은 저장의 결과를 **새 저장을 만들지 않고** 다시 묻는다.
   * 서버가 기록을 잃었으면(UNKNOWN) 성공도 실패도 추측하지 않고 최신 방 상태만 다시 확보한다.
   */
  const verifyRoomSettingsResult = async () => {
    const pending = pendingSettingsRequest
    if (!pending) return { ok: false, code: 'NO_PENDING' }
    const socket = getSocket()
    if (!socket || !socket.connected || !window.navigator.onLine) {
      alert(SOCKET_UNAVAILABLE_MESSAGE)
      return { ok: false, code: 'OFFLINE' }
    }

    const requestUuid = useAuthStore.getState().user?.uuid
    settingsRequestVersionRef.current += 1
    const requestVersion = settingsRequestVersionRef.current
    const requestSocket = socket
    // 저장 경로와 **같은 소유권 계약**이다 — 결과 조회도 그 소속에 묶인 요청이다.
    const requestMembership = roomMembershipGenerationRef.current
    const requestApplyGeneration = roomApplyGenerationRef.current
    const isStaleResponse = () =>
      !mountedRef.current
      || requestVersion !== settingsRequestVersionRef.current
      || requestSocket !== getSocket()
      || useAuthStore.getState().user?.uuid !== requestUuid
      || requestMembership !== roomMembershipGenerationRef.current
    const isRoomSnapshotFresh = () => roomApplyGenerationRef.current === requestApplyGeneration

    isSavingSettingsRef.current = true
    setIsSavingSettings(true)
    try {
      const response = await requestSocket
        .timeout(ROOM_SETTINGS_RESULT_TIMEOUT_MS)
        .emitWithAck(SOCKET_EVENTS.GET_ROOM_SETTINGS_UPDATE_RESULT, pending)
      if (isStaleResponse()) return { ok: false, code: 'STALE' }
      if (!response?.ok) return { ok: false, code: response?.code ?? ROOM_SETTINGS_ERROR_CODES.UNKNOWN }

      // 결과(status)는 이 요청의 정착이고, room은 그 응답이 실어 보낸 스냅샷이다. 조회를
      // 보낸 뒤에 설정 변경 방송 같은 더 새로운 사건을 이미 반영했다면, 정착은 그대로 받되
      // 스냅샷은 적용하지 않는다 — 적용하면 방금 받은 새 설정이 옛 값으로 되돌아간다.
      const appliedAuthoritativeRoom = Boolean(response.room) && isRoomSnapshotFresh()
        && response.room.roomId === useMatchingStore.getState().roomId
      if (appliedAuthoritativeRoom) {
        useMatchingStore.getState().setRoom(response.room)
        bumpRoomApplyGeneration()
      }

      if (response.status === 'UNKNOWN') {
        // 기록이 없다 — 적용됐는지 알 수 없다. 자동으로 다시 저장하지 않고 현재 소속·설정을
        // 다시 확인하도록만 안내한다.
        //
        // 이 순간 확인 대기(pending)가 풀리면서 대기 표시가 사라지고, 편집 패널은 저장 직후의
        // 잠금으로 이미 닫혀 있다. 그래서 결론을 **대기와 무관한 자리**에 남긴다 — 여기에
        // 남기지 않으면 "성공도 실패도 알 수 없다"가 화면 어디에도 표시되지 않는다.
        setSettingsError(null)
        setPendingSettingsRequest(null)
        setSettingsResultNotice(ROOM_SETTINGS_ERROR_MESSAGES.RESULT_UNRESOLVED)
        requestRoomResync()
        return { ok: true, status: 'UNKNOWN' }
      }

      // 서버가 적용 여부를 확정해 줬다 — 미해결 안내가 남아 있었다면 그 결론이 대체한다.
      setPendingSettingsRequest(null)
      setSettingsError(null)
      setSettingsResultNotice(null)

      // **스냅샷이 없다는 사실은 지금 소속이 유효하다는 증거가 아니다.**
      //
      // 서버(handleGetRoomSettingsUpdateResult)는 요청자가 **지금도 그 방의 확정 참가자일
      // 때만** room을 싣는다. 역사적 결과(APPLIED/NO_CHANGE)는 알려주면서 room을 비웠다면,
      // 그 사이 이탈·방 삭제·게임 시작으로 서버는 더 이상 이 계정을 그 방에 두고
      // 있지 않다는 뜻이다. 그런데 이 화면은 여전히 옛 방·옛 설정·옛 권한을 들고 있고,
      // 검증도 'verified'로 남아 있다 — 그 위에서 준비·시작·저장이 계속 열린다.
      //
      // 그래서 이 요청의 정착은 그대로 보존하되(다시 저장하지 않는다 — 다시 저장할지는 최신
      // 설정을 본 방장이 정한다), 행동을 열어 두기 전에 권위 있는 소속·설정을 다시 확보한다.
      // 방 스냅샷이 없으면 중간에 준비 방송이 왔어도 현재 소속을 증명하지 못한다.
      //
      // 스냅샷이 있는데도 적용하지 않은 경우는 두 가지를 갈라 봐야 한다. **끼어든 사건이 적용
      // 세대를 올렸다는 사실 자체는 "더 새로운 설정을 이미 받았다"의 증거가 아니다** — v1에서
      // 발행된 준비 방송이 늦게 도착한 것뿐일 수 있고, 그동안 우리가 놓친 설정 방송의 v2가
      // 바로 이 응답에 실려 있을 수 있다. 그것을 통째로 버리고 끝내면 화면은 v1에 머문 채
      // 그 버전을 기대 버전으로 삼아 편집을 계속 허용한다. 스냅샷을 그대로 덮어쓰지는 않되
      // (그 뒤의 방장·준비를 되돌릴 수 있다), 더 새로운 설정이 드러났으면 권위 있는 조회로
      // 최신 값을 다시 확보한다.
      //
      // 반대로 그 사이 **진짜 더 새로운 설정 방송**을 이미 반영했다면 이 응답은 그보다 옛것이라
      // 아무것도 드러내지 못하고, 여기서 또 물으면 조회가 꼬리를 문다 — 그때는 묻지 않는다.
      if (!appliedAuthoritativeRoom
        && (!response.room || isRoomSnapshotFresh() || revealsNewerSettingsVersion(response.room))) {
        requestRoomResync()
      }
      return { ok: true, status: response.status, settingsVersion: response.settingsVersion }
    } catch {
      if (!isStaleResponse()) {
        setSettingsError({ code: ROOM_SETTINGS_ERROR_CODES.UNKNOWN, message: ROOM_SETTINGS_ERROR_MESSAGES.RESULT_UNKNOWN })
      }
      return { ok: false, code: ROOM_SETTINGS_ERROR_CODES.UNKNOWN }
    } finally {
      if (requestVersion === settingsRequestVersionRef.current) clearSettingsState()
    }
  }

  return {
    deleteRoom,
    startGame,
    setReady,
    isStarting,
    isSettingReady,
    isRoomVerified,
    saveRoomSettings,
    verifyRoomSettingsResult,
    isSavingSettings,
    // 저장 결과가 미확인인 동안에는 새 저장을 잠근다(원 요청자만 그 결과를 확인할 수 있다).
    hasPendingSettingsResult: pendingSettingsRequest !== null,
    settingsError,
    // 확인 절차까지 마쳤는데도 적용 여부를 알 수 없을 때 대기방에 남는 안내다(자동 재저장 없음).
    settingsResultNotice,
    dismissSettingsResultNotice: () => setSettingsResultNotice(null),
    startBlockedMessage,
    dismissStartBlockedMessage: () => setStartBlockedMessage(null),
  }
}
