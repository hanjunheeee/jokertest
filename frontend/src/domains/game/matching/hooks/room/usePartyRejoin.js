// 판 끝난 뒤 방장이 만든 파티 방으로 다시 들어가기
// hooks/room/useRoom이 씀, 방에 없고 파티 방을 기다릴 때만 붙음
// 방송(파티 방 준비됨)·주기적 묻기·남아 있던 방송 세 길로 방 코드를 받아 들어감
// 방이 없어졌다·꽉 찼다는 거절이 오거나 너무 오래 기다리면 그만두고 onGiveUp으로 알림 (FE-005)
// 들어가기 요청·Node 옮기기는 partyRejoinRequest, 주기적 묻기·그만두기는 partyRejoinPoll
import { useEffect, useRef } from 'react'
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

// 파티 방 재입장 효과 (소켓·끝난 판 id·기다림 여부 바뀌면 다시 붙음)
export function usePartyRejoin(ctx, socket, endedGameId, awaitParty, onGiveUp) {
  // 기다리기 시작한 때 (소켓이 바뀌어 다시 붙어도 처음 때 그대로)
  const waitStartedAtRef = useRef(null)
  // 그만둘 때 부를 함수는 최신 것으로
  const onGiveUpRef = useRef(onGiveUp)
  useEffect(() => { onGiveUpRef.current = onGiveUp })

  useEffect(() => {
    const { awaitPartyRef, endedIdRef, partyBusyRef } = ctx
    // 소켓 없거나 파티 방 안 기다리면 안 붙음
    if (!socket || !awaitPartyRef.current) {
      if (!awaitPartyRef.current) waitStartedAtRef.current = null
      return undefined
    }
    if (waitStartedAtRef.current === null) waitStartedAtRef.current = Date.now()

    // 이번에 붙은 한 번치 상태 (partyRejoinRequest·partyRejoinPoll이 같이 읽고 바꿈)
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, endedGameId, awaitParty])
}
