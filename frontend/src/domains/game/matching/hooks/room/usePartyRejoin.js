// 판 끝난 뒤 방장이 만든 파티 방으로 다시 들어가기
// hooks/room/useRoom이 씀, 방에 없고 파티 방을 기다릴 때만 붙음
// 방송(파티 방 준비됨)·주기적 묻기·남아 있던 방송 세 길로 방 코드를 받아 들어감
// 방이 없어졌다·꽉 찼다는 거절이 오거나 너무 오래 기다리면 그만두고 onGiveUp으로 알림 (FE-005)
// 한 번치 실행(방송 붙이기·묻기 시작)은 partyRejoinRun
import { useEffect, useRef } from 'react'
import { startPartyRejoin } from './partyRejoinRun.js'

// 파티 방 재입장 효과 (소켓·끝난 판 id·기다림 여부 바뀌면 다시 붙음)
export function usePartyRejoin(ctx, socket, endedGameId, awaitParty, onGiveUp) {
  // 기다리기 시작한 때 (소켓이 바뀌어 다시 붙어도 처음 때 그대로)
  const waitStartedAtRef = useRef(null)
  // 그만둘 때 부를 함수는 최신 것으로
  const onGiveUpRef = useRef(onGiveUp)
  useEffect(() => { onGiveUpRef.current = onGiveUp })

  useEffect(() => {
    const { awaitPartyRef } = ctx
    // 소켓 없거나 파티 방 안 기다리면 안 붙음
    if (!socket || !awaitPartyRef.current) {
      if (!awaitPartyRef.current) waitStartedAtRef.current = null
      return undefined
    }
    if (waitStartedAtRef.current === null) waitStartedAtRef.current = Date.now()
    return startPartyRejoin(ctx, socket, waitStartedAtRef, onGiveUpRef)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, endedGameId, awaitParty])
}
