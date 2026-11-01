// 계정 캐시(프로필·지갑·업적) 새로고침 창구 (스토어를 등록해 두고 이름으로 부름)
// ProtectedRoute가 등록하고 인게임 사건 처리(game/ingame/hooks/sessionEvents)가 새로고침함, 시험도 씀

// 등록된 스토어 (없으면 null)
let registry = { profile: null, economy: null, achievements: null }

// 스토어 등록 (안 준 칸은 null)
export function registerAccountCacheStores(next) {
    registry = {
        profile: next?.profile ?? null,
        economy: next?.economy ?? null,
        achievements: next?.achievements ?? null,
    }
}

// 등록 지우기 (시험이 씀)
export function clearAccountCacheStores() {
    registry = { profile: null, economy: null, achievements: null }
}

// 새로고침할 수 있는 이름과 부르는 순서
export const ACCOUNT_CACHE_SCOPES = Object.freeze(["profile", "economy", "achievements"])

// 고른 이름만 새로고침, invalidate면 무효화로 다시 받기
export function refreshAccountCaches(scopes, { invalidate = false } = {}) {
    // 이름이 없으면 할 일 없음
    if (!Array.isArray(scopes) || scopes.length === 0) return

    for (const key of ACCOUNT_CACHE_SCOPES) {
        if (!scopes.includes(key)) continue
        const store = registry[key]
        // 등록 안 된 스토어는 건너뜀
        if (!store) continue
        try {
            // 무효화를 고르면 invalidate부터 (없으면 아래 일반 새로고침)
            if (invalidate && typeof store.invalidate === "function") {
                Promise.resolve(store.invalidate()).catch(() => {})
                continue
            }
            // 이미 받는 중이면 다시 안 부름 (무효화 때는 안 봄)
            if (!invalidate && typeof store.isLoading === "function" && store.isLoading()) continue
            // refresh가 없으면 fetch를 씀
            const run = typeof store.refresh === "function" ? store.refresh : store.fetch
            if (typeof run !== "function") continue
            Promise.resolve(run()).catch(() => {})
        } catch {
            // 스토어 하나가 실패해도 다음 스토어 갱신은 계속함
        }
    }
}
