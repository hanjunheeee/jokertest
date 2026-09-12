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
 *   3) 복원이 끝난 뒤에만, 그리고 계정·소켓·**접속 세대**가 그대로일 때만
 *      notifications_ready를 보낸다. GET이 실패하면 준비 신호를 보내지 않는다 — 서버가
 *      "수신기가 준비됐다"고 오해한 채 첫 시스템 안내를 만들어 전달하면, 그 사건을 아무도
 *      받지 못한 채 소모된다.
 *
 * 두 개의 세대 값을 구분한다(R-IMPL #1):
 *   - 계정 세대(store.accountGeneration): 인증 계정이 바뀌면 오른다. 이 effect 자체도
 *     계정 uuid가 바뀌면 통째로 다시 돈다.
 *   - 접속 세대(아래 connectionGeneration): **같은 Socket.IO 객체**의 실제 connect마다
 *     오른다. socket 객체만 보면 transient disconnect→connect를 전혀 감지하지 못해,
 *     (a) GET이 connect 이전에 끝난 경우 준비 신호가 영구 미발송으로 남고,
 *     (b) 재접속 후 목록이 다시 동기화되지 않는다.
 *   한 접속에 대한 재동기화는 한 번만 하고, 이전 접속에서 늦게 끝난 복원·ACK는 버린다.
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

/** ready ACK를 이만큼 기다린 뒤 한 번 더 시도한다. 무한 대기·busy loop를 만들지 않는다. */
export const READY_ACK_TIMEOUT_MS = 5000
/** 한 접속에서 보내는 ready 시도 횟수 상한. 넘으면 retry 상태로 남기고 멈춘다. */
export const READY_MAX_ATTEMPTS = 3

// 타이머는 외부 자원이라 시험이 소유할 수 있어야 한다(ACK timeout을 실시간으로 기다리지
// 않게). 런타임 코드에서는 이 설정을 건드리지 않는다 — api 주입(__setNotificationsApiForTests)
// 과 같은 관례다.
let timerOverride = null

/** 시험 전용 — { setTimeout, clearTimeout }을 주입한다. */
export function __setNotificationTimersForTests(next) {
  timerOverride = next ?? null
}

const schedule = (fn, ms) => (timerOverride?.setTimeout ?? globalThis.setTimeout)(fn, ms)
const unschedule = (id) => {
  if (id === null || id === undefined) return
  ;(timerOverride?.clearTimeout ?? globalThis.clearTimeout)(id)
}

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
    // 실제 connect마다 오르는 접속 세대. 계정 세대와 **별개**다.
    let connectionGeneration = 0
    // 현재 접속 세대의 동기화 상태(아래 startSync가 만든다).
    let sync = null

    const accountAlive = () =>
      !cancelled && store.getState().accountGeneration === accountGeneration

    // (1) 리스너 먼저. 계정만 대조한다 — 접속 세대는 목록 반영의 조건이 아니다(끊김 직후
    // 도착한 사건도 목록에는 남아야 한다). 소리 적격성은 store의 복원 경계가 판정한다.
    const handleNotificationCreated = (payload) => {
      if (!accountAlive()) return
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

    /** 이 동기화가 여전히 "현재 계정 · 현재 접속"의 것인가. */
    const isActive = (active) =>
      active !== null && sync === active && accountAlive() && active.generation === connectionGeneration

    const teardownSync = () => {
      if (sync === null) return
      unschedule(sync.timer)
      sync.timer = null
      try {
        sync.unsubscribe()
      } catch {
        // 구독 해제 실패가 나머지 정리를 막지 않는다.
      }
      sync = null
    }

    /**
     * 준비 신호를 보낸다. ACK가 제한 시간 안에 오지 않으면 **한 번 더** 시도하고, 상한에
     * 닿으면 retry 상태로 남긴다 — 조회·읽음·닫기를 잠그지 않는다(AC-07).
     */
    const attemptReady = () => {
      const active = sync
      if (!isActive(active)) return
      if (active.readyAcked || !active.snapshotReady) return
      // 아직 연결되지 않은 접속이면 보내지 않는다 — connect 핸들러가 다시 부른다.
      if (!active.connected || socket.connected === false) {
        store.getState().setReadyState("retry")
        return
      }
      if (active.attempts >= READY_MAX_ATTEMPTS) {
        store.getState().setReadyState("retry")
        return
      }

      active.attempts += 1
      let settled = false
      const settle = (ok) => {
        if (settled) return
        settled = true
        unschedule(active.timer)
        active.timer = null
        // 이전 접속·다른 계정의 늦은 ACK는 현재 상태를 건드리지 않는다.
        if (!isActive(active)) return
        if (ok) {
          active.readyAcked = true
          store.getState().setReadyState("sent")
          return
        }
        store.getState().setReadyState("retry")
        if (active.attempts < READY_MAX_ATTEMPTS) attemptReady()
      }

      try {
        socket.emit("notifications_ready", {}, (ack) => settle(ack?.ok === true))
      } catch {
        settle(false)
        return
      }
      active.timer = schedule(() => settle(false), READY_ACK_TIMEOUT_MS)
    }

    /**
     * 한 접속에 대한 재동기화를 시작한다: 복원을 다시 받고(그동안 도착하는 사건은 복원으로
     * 취급되어 무음), 복원이 끝나면 준비 신호를 보낸다.
     */
    const startSync = ({ connected }) => {
      teardownSync()
      connectionGeneration += 1
      const active = {
        generation: connectionGeneration,
        connected,
        attempts: 0,
        timer: null,
        readyAcked: false,
        snapshotReady: false,
        unsubscribe: () => {},
      }
      sync = active

      // 복원이 실제로 끝나는 순간을 구독으로 감지한다. 첫 GET이 실패한 뒤 화면의 재시도로
      // 복원에 성공한 경우에도 같은 경계를 타야 하기 때문이다.
      active.unsubscribe = store.subscribe((state, previous) => {
        if (!isActive(active)) return
        if (state.snapshotLoaded && !previous.snapshotLoaded) {
          active.snapshotReady = true
          attemptReady()
        }
      })

      store.getState().beginResync()
      store.getState().loadSnapshot().then(
        (result) => {
          // 이전 접속에서 늦게 끝난 복원은 현재 접속의 준비 상태를 건드리지 않는다.
          if (!isActive(active)) return
          if (!result.ok) store.getState().setReadyState("retry")
        },
        () => {
          if (!isActive(active)) return
          store.getState().setReadyState("retry")
        },
      )
    }

    const handleConnect = () => {
      if (!accountAlive()) return
      if (sync !== null && sync.connected === false) {
        // effect를 달 때 아직 연결되지 않았던 **그 접속**이 이제 열렸다. 같은 접속이므로
        // 목록을 다시 받지 않고 준비 신호만 보낸다(복원은 이미 진행·완료됐다).
        sync.connected = true
        attemptReady()
        return
      }
      // 실제 재접속 — 새 접속 세대로 다시 동기화한다.
      startSync({ connected: true })
    }

    const handleDisconnect = () => {
      if (!accountAlive()) return
      // 이 접속에 속한 늦은 복원·ACK 완료를 전부 무효화한다. 다음 connect가 새 세대로
      // 다시 동기화한다. 이미 받아 둔 목록과 soundSeen은 그대로 둔다(같은 계정이다).
      connectionGeneration += 1
      teardownSync()
      store.getState().setReadyState("retry")
    }

    socket.on("connect", handleConnect)
    socket.on("disconnect", handleDisconnect)

    // (2) 장착 시점의 접속으로 첫 동기화를 시작한다. connected를 알 수 없는 대역에서는
    // 기존 동작대로 "연결됨"으로 본다(false만 명시적 미연결로 취급).
    startSync({ connected: socket.connected !== false })

    return () => {
      cancelled = true
      teardownSync()
      // 등록할 때와 **동일한 함수 참조**로 off한다 — event명만으로 off하면 같은 이벤트의
      // 다른 구독자 리스너까지 지운다(useFriendSocketEvents와 같은 관례).
      socket.off("notification_created", handleNotificationCreated)
      socket.off("connect", handleConnect)
      socket.off("disconnect", handleDisconnect)
    }
  }, [socket, accountUuid])
}
