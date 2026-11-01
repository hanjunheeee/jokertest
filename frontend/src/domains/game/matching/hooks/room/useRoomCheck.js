// 서버에 지금 내 방을 물어서 대기방 상태가 맞는지 확인 (확인돼야 시작·준비·설정 가능)
// hooks/room/useRoom이 씀, 소켓이 붙거나 다시 연결되면 확인 시작
// 확인 도중 다른 반영이 끼거나 소켓·계정·방이 바뀌면 그 응답은 버림
// 200줄 넘지만 한 파일에 둠: 묶음 id·요청 버전·재시도 타이머를 효과 하나 안의 지역 변수로 함수들이 같이 써서, 나누면 정리 시점이 어긋남
import { useEffect } from 'react'
import { getSocket } from '@/shared/socket/socketClient.js'
import { useMatchingStore } from '../../store/matchingStore'
import { useAuthStore } from '@/domains/auth/store/auth.store'
import { dispatchUiSfx } from '@/shared/hooks/useSfxRuntime.js'
import { PENDING_MAX_RETRIES, PENDING_RETRY_MS } from '../../constants/roomTiming.js'
import { ROOM_MESSAGES } from '../../constants/roomMessages.js'
import { onConnection } from '../../socket/events.js'
import { askRoom } from '../../socket/room.js'

export function useRoomCheck(ctx, socket, onRoomDeleted) {
  useEffect(() => {
    const {
      setSyncStatus, identityRef, applyGenRef, memberGenRef, mountedRef, awaitPartyRef,
      bumpRef, resyncRef, invalidateRef, applyVerified, dropRequests,
    } = ctx
    if (!socket) {
      setSyncStatus('waiting_socket')
      return
    }

    // 새 소켓이면 그 소켓·계정을 기억, 계정이 바뀌면 확인 안 함
    if (identityRef.current.socket !== socket) {
      identityRef.current = { socket, uuid: useAuthStore.getState().user?.uuid ?? null }
    }
    const isSameIdentity = () =>
      identityRef.current.socket === socket
      && identityRef.current.uuid === (useAuthStore.getState().user?.uuid ?? null)

    // 확인 묶음(series) 상태: 묶음 id·요청 버전이 바뀌면 옛 응답 버림
    let cancelled = false
    let retryTimer = null
    let seriesId = 0
    let reqVer = 0
    let inFlight = false

    const advance = () => { applyGenRef.current += 1 }
    let prompted = false

    // 진행 중 확인 무효화, 재시도 타이머 지움
    const stopCheck = () => {
      seriesId += 1
      reqVer += 1
      inFlight = false
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer)
        retryTimer = null
      }
    }

    // 확인 실패: 한 번만 다시 확인할지 물음
    const fail = (id) => {
      if (cancelled || id !== seriesId) return
      setSyncStatus('failed')
      if (prompted) return
      prompted = true
      const confirmed = window.confirm(ROOM_MESSAGES.CHECK_RETRY)
      dispatchUiSfx(confirmed ? 'ui-confirm' : 'ui-cancel')
      if (confirmed) {
        startSeries({ resetPrompt: false })
      }
    }

    // 확인 한 번 보내기
    const attempt = (id, retryCount) => {
      if (cancelled || id !== seriesId) return

      // 지금 소켓이 아니거나 끊겼거나 계정이 바뀌었으면 연결 기다림
      if (socket !== getSocket() || !socket.connected || !window.navigator.onLine) {
        setSyncStatus('waiting_socket')
        return
      }
      if (!isSameIdentity()) {
        setSyncStatus('waiting_socket')
        return
      }

      // 보낼 때 값 잡아 둠, 응답 올 때 하나라도 바뀌었으면 버림
      reqVer += 1
      const ver = reqVer
      const reqSocket = socket
      const reqRoomId = useMatchingStore.getState().roomId
      const reqUuid = useAuthStore.getState().user?.uuid
      const reqApplyGen = applyGenRef.current
      const reqMember = memberGenRef.current

      const isStale = () =>
        cancelled ||
        reqSocket !== getSocket() ||
        id !== seriesId ||
        ver !== reqVer ||
        !mountedRef.current ||
        useMatchingStore.getState().roomId !== reqRoomId ||
        useAuthStore.getState().user?.uuid !== reqUuid ||
        applyGenRef.current !== reqApplyGen ||
        memberGenRef.current !== reqMember

      inFlight = true
      askRoom(reqSocket)
        .then((response) => {
          if (ver === reqVer) inFlight = false
          if (isStale()) return

          if (!response?.ok) {
            fail(id)
            return
          }

          // 방 있음: 확인된 방으로 넣음
          if (response.room) {
            applyVerified(() => useMatchingStore.getState().setRoom(response.room))
            advance()
            setSyncStatus('verified')
            prompted = false
            return
          }

          // 서버가 아직 방을 만드는 중: 정해진 횟수만 다시 물음
          if (response.pending) {
            if (retryCount < PENDING_MAX_RETRIES) {
              retryTimer = window.setTimeout(() => {
                retryTimer = null
                attempt(id, retryCount + 1)
              }, PENDING_RETRY_MS)
              return
            }
            fail(id)
            return
          }

          // 방 없음: 파티 방 기다리는 중이면 그대로 두고, 아니면 방 비우고 나감
          if (awaitPartyRef.current && !useMatchingStore.getState().isInRoom) {
            if (mountedRef.current) setSyncStatus('verified')
            return
          }
          applyVerified(() => useMatchingStore.getState().clearRoom())
          advance()
          onRoomDeleted?.()
        })
        .catch(() => {
          if (ver === reqVer) inFlight = false
          if (!isStale()) fail(id)
        })
    }

    // 새 확인 묶음 시작
    const startSeries = ({ resetPrompt }) => {
      if (retryTimer !== null) {
        window.clearTimeout(retryTimer)
        retryTimer = null
      }
      seriesId += 1
      if (resetPrompt) prompted = false
      setSyncStatus('checking')
      attempt(seriesId, 0)
    }

    // 다른 훅이 부르는 입구: 반영 세대 올림 / 방 다시 확인 / 확인 무효화
    bumpRef.current = () => {
      applyGenRef.current += 1
      if (!cancelled && inFlight) startSeries({ resetPrompt: false })
    }
    resyncRef.current = () => {
      if (cancelled) return
      applyGenRef.current += 1
      startSeries({ resetPrompt: false })
    }
    invalidateRef.current = () => {
      if (cancelled) return
      applyGenRef.current += 1
      startSeries({ resetPrompt: false })
    }

    if (socket.connected) {
      startSeries({ resetPrompt: true })
    } else {
      setSyncStatus('waiting_socket')
    }

    // 다시 연결되면 확인, 끊기면 보낸 요청 무효화
    const handleConnect = () => startSeries({ resetPrompt: true })
    const handleDisconnect = () => {
      stopCheck()
      dropRequests()
      setSyncStatus('waiting_socket')
    }
    const handleOffline = () => {
      stopCheck()
      dropRequests()
      setSyncStatus('waiting_socket')
    }
    const handleOnline = () => {
      if (cancelled) return
      if (socket !== getSocket()) return
      if (socket.connected) startSeries({ resetPrompt: true })
    }
    const off = onConnection(socket, { connect: handleConnect, disconnect: handleDisconnect })
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    return () => {
      cancelled = true
      bumpRef.current = null
      resyncRef.current = null
      invalidateRef.current = null
      stopCheck()
      dropRequests()
      off()
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, onRoomDeleted])
}
