// 연결마다 복원 → ready 보내기 → 응답 기다림·재시도
// 알림 소켓 훅이 소켓·계정마다 만들어 씀, 다시 연결되면 이전 진행분은 버림
import { emitNotificationsReady } from "../../socket/notifications.socket.js"
import { READY_ACK_TIMEOUT_MS, READY_MAX_ATTEMPTS } from "../../constants/notificationReady.js"
import { schedule, unschedule } from "./timers.js"

// start·connect·disconnect·teardown 묶음 만듦
export function createReadySync(socket, store, accountAlive) {
  let generation = 0
  let sync = null

  // 지금 연결의 진행분이고 계정도 그대로일 때만 결과를 씀
  const isActive = (active) =>
    active !== null && sync === active && accountAlive() && active.generation === generation

  // 타이머·스토어 구독 정리
  const teardown = () => {
    if (sync === null) return
    unschedule(sync.timer)
    sync.timer = null
    try {
      sync.unsubscribe()
    } catch {
      // 이미 풀린 구독이면 무시함
    }
    sync = null
  }

  // 복원이 끝났고 연결돼 있을 때만 ready 보냄, 한도까지 다시 보냄
  const attemptReady = () => {
    const active = sync
    // 지난 진행분·이미 응답받음·복원 전이면 안 보냄
    if (!isActive(active)) return
    if (active.readyAcked || !active.snapshotReady) return
    // 끊겨 있거나 한도를 다 썼으면 재시도 표시만 하고 멈춤
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
    // 응답·시간 초과 중 먼저 온 것 하나만 반영
    const settle = (ok) => {
      if (settled) return
      settled = true
      unschedule(active.timer)
      active.timer = null
      if (!isActive(active)) return
      // 응답 오면 보냄 확정, 실패면 재시도 표시 뒤 한도 안에서 다시 보냄
      if (ok) {
        active.readyAcked = true
        store.getState().setReadyState("sent")
        return
      }
      store.getState().setReadyState("retry")
      if (active.attempts < READY_MAX_ATTEMPTS) attemptReady()
    }

    // 보내기 자체가 터지면 바로 실패, 아니면 시간 초과 타이머 걺
    try {
      emitNotificationsReady(socket, (ack) => settle(ack?.ok === true))
    } catch {
      settle(false)
      return
    }
    active.timer = schedule(() => settle(false), READY_ACK_TIMEOUT_MS)
  }

  // 새 진행분 시작: 복원 완료를 구독하고 복원 시작
  const start = ({ connected }) => {
    teardown()
    generation += 1
    const active = {
      generation,
      connected,
      attempts: 0,
      timer: null,
      readyAcked: false,
      snapshotReady: false,
      unsubscribe: () => {},
    }
    sync = active

    // 복원이 끝나는 순간(snapshotLoaded가 켜질 때) ready 시도
    active.unsubscribe = store.subscribe((state, previous) => {
      if (!isActive(active)) return
      if (state.snapshotLoaded && !previous.snapshotLoaded) {
        active.snapshotReady = true
        attemptReady()
      }
    })

    // 복원 다시 시작, 실패하면 재시도 표시
    store.getState().beginResync()
    store.getState().loadSnapshot().then(
      (result) => {
        if (!isActive(active)) return
        if (!result.ok) store.getState().setReadyState("retry")
      },
      () => {
        if (!isActive(active)) return
        store.getState().setReadyState("retry")
      },
    )
  }

  // 끊긴 채 시작한 진행분이면 이어서 ready만 보내고, 아니면 새로 시작 (지난 계정이면 무시)
  const connect = () => {
    if (!accountAlive()) return
    if (sync !== null && sync.connected === false) {
      sync.connected = true
      attemptReady()
      return
    }
    start({ connected: true })
  }

  // 끊기면 진행분 버리고 재시도 상태로 둠
  const disconnect = () => {
    if (!accountAlive()) return
    generation += 1
    teardown()
    store.getState().setReadyState("retry")
  }

  return { start, connect, disconnect, teardown }
}
