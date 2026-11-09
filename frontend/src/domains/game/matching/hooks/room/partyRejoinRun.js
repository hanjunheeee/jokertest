// 파티 방 재입장 한 번치 실행 (상태 만들기·방송 붙이기·주기적 묻기 시작)
// usePartyRejoin이 효과 안에서 씀, 들어가기 요청은 partyRejoinRequest, 묻기·그만두기는 partyRejoinPoll
import { getSocket } from '@/shared/socket/socketClient.js'
import { useAuthStore } from '@/domains/auth/store/auth.store'
import { PARTY_POLL_MS } from '../../constants/roomTiming.js'
import { ROOM_MESSAGES } from '../../constants/roomMessages.js'
import { consumeRoomReady, rememberRoomReady } from '../../../shared/utils/partyMatchingRejoin.js'
import { onParty } from '../../socket/party.js'
import { completeJoin, requestJoin, retryOnOwnerNode } from './partyRejoinRequest.js'
import { giveUp, poll } from './partyRejoinPoll.js'

// 다시 해도 안 될 입장 거절 (방 없어짐·꽉 참·이미 시작·코드 다름·판 끝남)
const GIVE_UP_CODES = new Set([
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'ROOM_ALREADY_STARTED',
  'ROOM_CODE_MISMATCH',
  'SESSION_ENDED',
])

// 이번에 붙은 한 번치 상태 (partyRejoinRequest·partyRejoinPoll이 같이 읽고 바꿈)
function createRun(ctx, socket, waitStartedAtRef, onGiveUpRef) {
  const attachedUuid = useAuthStore.getState().user?.uuid ?? null
  const run = {
    ctx, socket, attachedUuid, waitStartedAtRef, onGiveUpRef,
    owned: true, // false면 옛 응답 막음
    lastJoin: null, // 마지막 들어가기 요청 { payload, moved } (Node 옮긴 뒤 다시 보낼 때 씀)
    pollTimer: null,
    pollBusy: false,
  }
  // 붙인 소켓·계정이 그대로일 때만 응답 반영
  run.isCurrent = () =>
    run.owned
    && socket === getSocket()
    && (useAuthStore.getState().user?.uuid ?? null) === attachedUuid
  return run
}

// 받아 둔 방송 먼저 쓰고 한 번 묻기, 방송 붙이고 주기적으로 묻기 시작, 떼는 함수 돌려줌
export function startPartyRejoin(ctx, socket, waitStartedAtRef, onGiveUpRef) {
  const { endedIdRef, partyBusyRef } = ctx
  const run = createRun(ctx, socket, waitStartedAtRef, onGiveUpRef)

  // 들어가기 성공 방송: 방 넣고 끝냄
  const handleJoined = (payload) => {
    completeJoin(run, payload)
  }

  // 파티 방 준비됨 방송: 기억해 두고 바로 들어가기 시도
  const handleReady = (payload) => {
    rememberRoomReady(payload)
    requestJoin(run, payload)
  }

  // 화면 오기 전에 받아 둔 방송이 있으면 먼저 씀, 그다음 바로 한 번 묻기
  const pendingParty = consumeRoomReady(endedIdRef.current)
  if (pendingParty) requestJoin(run, pendingParty)
  poll(run)

  // 들어가기 실패: 다시 해도 안 될 거절이면 그만두고, 아니면 다음 묻기 때 다시 시도
  const handleJoinFailed = (payload) => {
    if (!run.isCurrent()) return
    // 내가 보낸 파티 방 입장 요청의 실패만 봄
    if (!partyBusyRef.current) return
    if (retryOnOwnerNode(run, payload)) return
    partyBusyRef.current = false
    if (GIVE_UP_CODES.has(payload?.code)) giveUp(run, ROOM_MESSAGES.PARTY_ROOM_GONE)
  }

  // 방송 붙이고 주기적으로 묻기 시작
  const off = onParty(socket, { joined: handleJoined, joinFailed: handleJoinFailed, ready: handleReady })

  run.pollTimer = window.setInterval(() => poll(run), PARTY_POLL_MS)

  // 떠날 때 옛 응답 막고 타이머·방송 뗌
  return () => {
    run.owned = false
    window.clearInterval(run.pollTimer)
    off()
  }
}
