/**
 * F-17 알림 수신 훅(AC-01/AC-05/AC-07).
 *
 * App 수명에 한 번 장착한다 — 알림은 계정 전역 사건이라 특정 화면에 묶이면 그 화면을
 * 떠난 동안의 전달을 통째로 놓친다(useSfxRuntime의 achievement_granted 구독과 같은 이유).
 *
 * 순서가 계약이다(AC-07):
 *   1) notification_created 리스너를 **먼저** 단다 — 그래야 복원 중에 도착한 사건을
 *      잃지 않는다(그 사건들은 store의 liveBuffer에 모였다가 복원과 함께 무음 병합된다).
 *   2) GET으로 전체 목록을 복원한다.
 *   3) 복원이 끝난 뒤에만, 그리고 계정·소켓이 그대로일 때만 notifications_ready를 보낸다.
 *      GET이 실패하면 준비 신호를 보내지 않는다 — 서버가 "수신기가 준비됐다"고 오해한 채
 *      첫 시스템 안내를 만들어 전달하면, 그 사건을 아무도 받지 못한 채 소모된다.
 *
 * 소리(A-04/A-06):
 *   - 목록 반영과 소리는 **독립**이다. dispatchSfxEvent의 completion을 기다리지 않고,
 *     소리 실패가 목록·읽음·모달 진행을 막지 않는다.
 *   - 복원·버퍼 병합·재접속은 전부 무음이다. live 최초 처리만 소리 후보다.
 *   - 친구·업적의 notification_created에는 서버가 sfxEvent를 싣지 않는다(그 소리는 기존
 *     F-16 수신자가 소유한다) — 여기서는 목록만 바뀐다.
 */
import { useEffect } from "react"

import { useAuthStore } from "../../auth/store/auth.store.js"
import { useNotificationsStore } from "../store/notifications.store.js"
import { dispatchSfxEvent } from "../../../shared/hooks/useSfxRuntime.js"

export function useNotificationSocketEvents(socket) {
  // 계정 uuid가 바뀌면(로그아웃 포함) 아래 effect가 통째로 다시 돌아야 한다 — 로그인
  // boolean만 보면 A→B 직접 전환에서 이전 계정의 구독이 그대로 살아남는다(A-05).
  const accountUuid = useAuthStore((state) =>
    state.isLoggedIn && state.user?.uuid ? state.user.uuid : null,
  )

  // 인증 상태 변화를 store 계정 경계에 즉시 반영한다. 이 구독은 소켓과 무관하게 살아 있어야
  // 한다 — 소켓이 없는 화면(로그인 직후 등)에서 로그아웃해도 이전 목록이 남으면 안 된다.
  useEffect(() => {
    useNotificationsStore.getState().syncAccount()
    return useAuthStore.subscribe(() => {
      useNotificationsStore.getState().syncAccount()
    })
  }, [])

  useEffect(() => {
    if (!socket || accountUuid === null) return undefined

    const store = useNotificationsStore
    store.getState().syncAccount()

    const accountId = store.getState().accountId
    // 구독을 시작한 시점의 계정 세대. 아래 모든 콜백이 이 값과 현재 값을 대조해, 계정이
    // 바뀐 뒤 도착한 늦은 사건·응답·ACK가 새 계정의 상태를 건드리지 못하게 한다.
    const accountGeneration = store.getState().accountGeneration
    if (accountId !== accountUuid) return undefined

    let cancelled = false
    const isCurrent = () => !cancelled && store.getState().accountGeneration === accountGeneration

    // (1) 리스너 먼저.
    const handleNotificationCreated = (payload) => {
      if (!isCurrent()) return
      const notification = payload?.notification
      const applied = store.getState().receiveLiveNotification(accountId, notification)
      // buffered(복원 전) · 계정 불일치 · 잘못된 형태는 전부 무음이다.
      if (!applied.applied) return

      const envelope = payload?.sfxEvent
      if (envelope === null || typeof envelope !== "object") return
      // 서버가 수신 경계에서 확인한 계정과 현재 인증 계정이 모두 일치해야 한다.
      if (envelope.accountId !== accountId) return
      if (envelope.origin !== "live") return
      // 원본 사건 키로 최초 처리인지 묻는다. 설정 off·mute여도 여기서 표식을 소모한다.
      if (!store.getState().consumeSoundEvent(accountId, notification.sourceKey)) return

      // completion을 기다리지 않는다(A-06). dispatchSfxEvent는 동기 반환이며 던지지 않는다.
      dispatchSfxEvent({
        kind: envelope.kind,
        eventId: envelope.eventId,
        accountId,
        origin: "live",
      })
    }

    socket.on("notification_created", handleNotificationCreated)

    // (3) 복원이 실제로 끝나는 순간에만 준비 신호를 보낸다. 구독으로 감지하는 이유는,
    // 첫 GET이 실패한 뒤 화면의 재시도로 복원에 성공한 경우에도 같은 경계를 타야 하기
    // 때문이다.
    let readySent = false
    const sendReady = () => {
      if (!isCurrent() || readySent) return
      // 이 소켓이 아직 살아 있는지 마지막으로 확인한다 — 끊긴 소켓으로 보낸 ready는
      // 서버에 닿지 않고, 닿더라도 서버가 현재 소켓이 아니라며 거부한다.
      if (socket.connected === false) {
        store.getState().setReadyState("retry")
        return
      }
      readySent = true
      try {
        socket.emit("notifications_ready", {}, (ack) => {
          if (!isCurrent()) return
          const ok = ack?.ok === true
          if (!ok) readySent = false
          // ACK 실패는 재시도 상태로만 기록한다 — 모달 조회·읽음·닫기를 잠그지 않는다.
          store.getState().setReadyState(ok ? "sent" : "retry")
        })
      } catch {
        readySent = false
        store.getState().setReadyState("retry")
      }
    }

    const unsubscribeStore = store.subscribe((state, previous) => {
      if (!isCurrent()) return
      if (state.snapshotLoaded && !previous.snapshotLoaded) sendReady()
    })

    // (2) 재접속으로 새 소켓이 생겼으면 복원을 다시 한다. 그동안 도착하는 사건은
    // 복원으로 취급되어 무음이다.
    store.getState().beginResync()
    store.getState().loadSnapshot().then(
      (result) => {
        if (!isCurrent()) return
        if (!result.ok) store.getState().setReadyState("retry")
      },
      () => {
        if (!isCurrent()) return
        store.getState().setReadyState("retry")
      },
    )

    return () => {
      cancelled = true
      unsubscribeStore()
      // 등록할 때와 **동일한 함수 참조**로 off한다 — event명만으로 off하면 같은 이벤트의
      // 다른 구독자 리스너까지 지운다(useFriendSocketEvents와 같은 관례).
      socket.off("notification_created", handleNotificationCreated)
    }
  }, [socket, accountUuid])
}
