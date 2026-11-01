let registry = { profile: null, economy: null, achievements: null }

export function registerAccountCacheStores(next) {
    registry = {
        profile: next?.profile ?? null,
        economy: next?.economy ?? null,
        achievements: next?.achievements ?? null,
    }
}

export function clearAccountCacheStores() {
    registry = { profile: null, economy: null, achievements: null }
}

export const ACCOUNT_CACHE_SCOPES = Object.freeze(["profile", "economy", "achievements"])

export function refreshAccountCaches(scopes, { invalidate = false } = {}) {
    if (!Array.isArray(scopes) || scopes.length === 0) return

    for (const key of ACCOUNT_CACHE_SCOPES) {
        if (!scopes.includes(key)) continue
        const store = registry[key]
        if (!store) continue
        try {
            if (invalidate && typeof store.invalidate === "function") {
                Promise.resolve(store.invalidate()).catch(() => {})
                continue
            }
            if (!invalidate && typeof store.isLoading === "function" && store.isLoading()) continue
            const run = typeof store.refresh === "function" ? store.refresh : store.fetch
            if (typeof run !== "function") continue
            Promise.resolve(run()).catch(() => {})
        } catch {
            // 스토어 하나가 실패해도 다음 스토어 갱신은 계속함
        }
    }
}
