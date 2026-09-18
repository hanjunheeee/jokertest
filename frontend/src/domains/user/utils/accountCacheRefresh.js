/**
 * F-21(A-10): 계정 캐시(전적·재화·업적)를 **서버 값으로 다시 읽게 하는** 단일 경계.
 *
 * ── 왜 store를 직접 import하지 않는가 ────────────────────────────────────────
 *
 * 이 경계를 부르는 곳은 전역 소켓 수신기(useGameSessionSocketEvents)다. 그 훅은 node:test에서
 * **실제로 마운트해** 검증하는 대상이라, import 체인에 `@/` 별칭이나 import.meta.env가 하나도
 * 없어야 한다(그 두 가지는 vite만 해석한다). 그런데 세 store는 전부 api 계층
 * (shared/api/client.js → shared/env.js)에 닿아 있어, 수신기가 그것들을 직접 import하면
 * 수신기 자체가 플레인 Node에서 로드되지 않는다 — 기존 수신기 시험들이 통째로 죽는다.
 *
 * 그래서 방향을 뒤집는다. 이 모듈은 아무것도 import하지 않고, **앱 진입점**(ProtectedRoute)이
 * 실제 store 세 개를 등록한다. 수신기는 등록된 것만 부른다.
 *
 * 등록 전에는 전부 no-op이다 — 로그인 화면처럼 아직 이 경계가 필요 없는 지점에서 조용히
 * 아무 일도 하지 않는다.
 */

/** 등록된 store들. 각각 { invalidate?, refresh?, fetch, isLoading? } 형태의 얇은 어댑터다. */
let registry = { profile: null, economy: null, achievements: null }

/**
 * 앱 진입점이 실제 store를 꽂는다. 같은 키를 다시 등록하면 덮어쓴다(HMR·테스트).
 * @param {{profile?: object|null, economy?: object|null, achievements?: object|null}} next
 */
export function registerAccountCacheStores(next) {
    registry = {
        profile: next?.profile ?? null,
        economy: next?.economy ?? null,
        achievements: next?.achievements ?? null,
    }
}

/** 테스트·로그아웃 정리용. 등록을 비우면 이후 호출은 전부 no-op이다. */
export function clearAccountCacheStores() {
    registry = { profile: null, economy: null, achievements: null }
}

/** 재진입·재연결·창 재활성화에서 함께 확인하는 범위. 세 화면(전적·상점·서고)의 입력이다. */
export const ACCOUNT_CACHE_SCOPES = Object.freeze(["profile", "economy", "achievements"])

/**
 * 등록된 캐시를 다시 읽게 한다.
 *
 * 호출자는 둘뿐이고 차이는 invalidate 하나다.
 *   - 서버 개인 신호(account_cache_invalidated): 새 사실이 생겼다는 통보다. 캐시를 낡은 것으로
 *     **선언**한다(invalidate=true) — 그래야 화면이 stale을 표시하고, 커밋 직전에 시작된 조회의
 *     옛 응답이 폐기된다.
 *   - 재진입·재연결·창 재활성화: 그 신호를 **못 받았을 수도 있다**는 것뿐이다. 캐시를 낡았다고
 *     선언하지 않고 값만 다시 확인한다(invalidate=false) — 끊겨 있는 동안 커밋된 전적, 다른
 *     탭에서 지나간 신호, 웹 프로세스 밖의 복구 지급(backfill CLI는 웹서버의 onlineUsers를
 *     공유하지 않는다)이 전부 이 경로로 수렴한다.
 *
 * 어느 store의 실패도 나머지를 막지 않게 각각 격리한다. 게임 상태·화면 이동은 건드리지 않는다.
 *
 * @param {string[]} scopes - 다시 읽을 범위. 알 수 없는 값은 무시한다.
 * @param {{invalidate?: boolean}} [options]
 */
export function refreshAccountCaches(scopes, { invalidate = false } = {}) {
    if (!Array.isArray(scopes) || scopes.length === 0) return

    for (const key of ACCOUNT_CACHE_SCOPES) {
        if (!scopes.includes(key)) continue
        const store = registry[key]
        if (!store) continue
        try {
            // 무효화는 언제나 새 조회를 보장한다. 단순 확인은 이미 날아가 있는 조회가 있으면
            // 그것으로 충분하다 — 그 응답 자체가 최신 서버 값이고, 각 store의 세대 검사가
            // 늦게 온 옛 응답을 이미 버린다.
            if (invalidate && typeof store.invalidate === "function") {
                Promise.resolve(store.invalidate()).catch(() => {})
                continue
            }
            if (!invalidate && typeof store.isLoading === "function" && store.isLoading()) continue
            const run = typeof store.refresh === "function" ? store.refresh : store.fetch
            if (typeof run !== "function") continue
            Promise.resolve(run()).catch(() => {})
        } catch {
            // 조회 실패는 각 화면의 stale/error/재시도 경로가 다룬다. 여기서 삼키는 것은
            // "다시 읽어라"를 전달하다 난 예외뿐이며, 다음 범위의 전달을 막지 않는다.
        }
    }
}
