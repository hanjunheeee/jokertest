// 계정이 바뀌거나 방이 바뀌면 보낸 요청·안내를 지우고 방 확인을 다시 시작
// hooks/room/useRoom이 씀, 두 스토어를 직접 구독함 (렌더를 기다리지 않고 바로 무효화하려고)
import { useEffect } from 'react'
import { useMatchingStore } from '../../store/matchingStore'
import { useAuthStore } from '@/domains/auth/store/auth.store'

// 세 요청(저장·시작·준비) 모두 무효화하고 소속 세대 올림 (이벤트 구독도 다시 붙음)
const dropAll = (ctx) => {
  ctx.memberGenRef.current += 1
  ctx.setEventGen(ctx.memberGenRef.current)
  ctx.settingsVerRef.current += 1
  ctx.inFlightRef.current = null
  ctx.clearSaving()
  ctx.startVerRef.current += 1
  ctx.readyVerRef.current += 1
  ctx.clearStart()
  ctx.clearReady()
}

// 확인 훅이 살아 있으면 확인 다시 시작, 없으면 연결 기다림 표시
const recheck = (ctx) => {
  if (ctx.invalidateRef.current) ctx.invalidateRef.current()
  else ctx.setSyncStatus('waiting_socket')
}

// 계정 바뀜·방 바뀜 구독 효과 둘
export function useRoomReset(ctx) {
  // 계정 바뀜: 남은 결과 확인·안내까지 다 지우고 방 비움
  useEffect(() => {
    const unsubscribe = useAuthStore.subscribe((state, prevState) => {
      const nextUuid = state?.user?.uuid ?? null
      const prevUuid = prevState?.user?.uuid ?? null
      if (nextUuid === prevUuid) return
      ctx.applyGenRef.current += 1
      dropAll(ctx)
      if (!ctx.mountedRef.current) return
      ctx.setPending(null)
      ctx.setSettingsError(null)
      ctx.setNotice(null)
      ctx.applyVerified(() => useMatchingStore.getState().clearRoom())

      recheck(ctx)
    })
    return () => unsubscribe?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 방 바뀜: 다른 방의 결과 확인만 지움, 확인된 방을 넣는 중이면 다시 확인 안 함
  useEffect(() => {
    const unsubscribe = useMatchingStore.subscribe((state, prevState) => {
      if (state.roomId === prevState.roomId) return
      dropAll(ctx)
      if (!ctx.mountedRef.current) return
      ctx.setPending((prev) => (prev && prev.roomId !== state.roomId ? null : prev))
      ctx.setNotice(null)

      if (ctx.applyingRef.current) return
      recheck(ctx)
    })
    return () => unsubscribe?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
