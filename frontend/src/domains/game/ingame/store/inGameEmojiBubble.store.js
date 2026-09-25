// 파일 역할: inGameEmojiBubble.store.js - 전역 상태 store입니다.
//
// E-3(F-33 AC-04): emoji_shown 수신과 플레이어 카드 렌더링을 잇는 유일한 통로다.
//
// **3초 만료 타이머의 소유자는 이 store 하나다.** 말풍선 컴포넌트가 자기 타이머를 들면
// 같은 uuid의 재수신이 컴포넌트 교체로 처리되면서 남은 시간이 화면마다 달라지고(교체 직전에
// 언마운트된 타이머는 취소되지 않는다), 보드가 리마운트될 때마다 3초가 처음부터 다시 흐른다.
// 여기서는 uuid 하나에 타이머 하나만 존재하도록 항상 앞의 것을 clearTimeout으로 걷어낸다.
//
// timers를 상태 트리 밖(모듈 스코프)에 두는 이유는 화면이 그 값을 읽지 않기 때문이다 —
// state에 넣으면 타이머 교체마다 byUuid를 구독하는 보드 전체가 의미 없이 리렌더된다.
import { create } from "zustand"

import { subscribeInGameIdentityScope } from "./ingameStore.js"

/** 말풍선이 화면에 머무는 시간. 서버 계약(EMOJI_MIN_INTERVAL_MS=1000)보다 길다 — 연속 전송은
 *  새 말풍선이 앞의 것을 교체하는 것으로 자연히 표현된다. */
export const INGAME_EMOJI_BUBBLE_DURATION_MS = 3000

/** uuid → setTimeout 핸들. 한 uuid에 하나만 살아 있다. */
const timers = new Map()

function clearBubbleTimer(uuid) {
  const timerId = timers.get(uuid)
  if (timerId === undefined) return
  clearTimeout(timerId)
  timers.delete(uuid)
}

export const useInGameEmojiBubbleStore = create((set, get) => ({
  /** uuid → { itemId, sentAt }. 이 키가 있는 카드만 말풍선을 그린다. */
  byUuid: {},

  /**
   * 그 uuid의 카드 위에 이 이모티콘을 띄운다(이미 떠 있으면 교체하고 3초를 처음부터 센다).
   *
   * payload 형식·게임 일치·등록 범위 판정은 수신 훅(useGameSessionSocketEvents)이 이미 했다 —
   * 여기서는 이 store가 자기 상태를 지키는 데 필요한 최소 형식만 다시 본다(fail-closed).
   */
  setActiveEmoji: (uuid, itemId, sentAt) => {
    if (typeof uuid !== "string" || uuid.length === 0) return
    if (typeof itemId !== "string" || itemId.length === 0) return
    // 교체는 **앞의 타이머를 걷어내는 것**까지가 한 동작이다. 걷어내지 않으면 앞의 타이머가
    // 제 시각에 깨어나 방금 띄운 새 말풍선을 지운다(2초에 재수신하면 1초만 보인다).
    clearBubbleTimer(uuid)
    const shownAt = Number.isFinite(sentAt) ? sentAt : null
    set((state) => ({ byUuid: { ...state.byUuid, [uuid]: { itemId, sentAt: shownAt } } }))
    timers.set(uuid, setTimeout(() => {
      timers.delete(uuid)
      get().removeActiveEmoji(uuid)
    }, INGAME_EMOJI_BUBBLE_DURATION_MS))
  },

  /** 만료·정리로 그 카드의 말풍선을 내린다. 없는 uuid면 참조 보존 no-op이다. */
  removeActiveEmoji: (uuid) => {
    clearBubbleTimer(uuid)
    set((state) => {
      if (!Object.hasOwn(state.byUuid, uuid)) return state
      const next = { ...state.byUuid }
      delete next[uuid]
      return { byUuid: next }
    })
  },

  /**
   * 남은 말풍선 전부를 즉시 비운다(타이머까지).
   *
   * 부르는 곳이 둘이다: 아래 신원/소속 전이 구독과, useGameSessionSocketEvents의 connectSeq
   * 갱신 effect(같은 소켓 객체의 재연결). 재연결은 아래 구독이 알려 주지 않는 전이라
   * 그 훅이 명시적으로 담당한다.
   */
  clearAllActiveEmoji: () => {
    for (const timerId of timers.values()) clearTimeout(timerId)
    timers.clear()
    set((state) => (Object.keys(state.byUuid).length === 0 ? state : { byUuid: {} }))
  },
}))

// 게임 교체·본인 전환·소속 전이에서 지나간 판의 말풍선을 남기지 않는다. 모듈 수명에 한 번만
// 구독한다 — 컴포넌트가 걸면 StrictMode의 setup→cleanup→setup이 구독을 다시 만든다.
subscribeInGameIdentityScope(() => {
  useInGameEmojiBubbleStore.getState().clearAllActiveEmoji()
})
