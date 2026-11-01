export async function bootstrapSession({ getMe, getMyProfile, store }) {
    store.getState().setSessionBootstrap("pending")
    try {
        const me = await getMe()
        const uuid = typeof me?.uuid === "string" ? me.uuid : null
        if (!uuid) throw new Error("서버 세션 응답에 uuid가 없다")

        const persisted = store.getState().user
        if (persisted?.uuid === uuid) {
            if (persisted.role !== me.role) store.getState().adoptRole(me.role)
            return { outcome: "kept", uuid }
        }

        let nickname = null
        try {
            const profile = await getMyProfile()
            if (typeof profile?.nickname === "string") nickname = profile.nickname
        } catch {
            // 프로필을 못 받아도 세션은 살아 있어서 닉네임 없이 로그인으로 둠
        }
        store.getState().login({ uuid, role: me.role, nickname })
        return { outcome: persisted ? "replaced" : "adopted", uuid }
    } catch {
        store.getState().logout()
        return { outcome: "logged-out", uuid: null }
    } finally {
        store.getState().setSessionBootstrap("done")
    }
}

export function resolveProtectedRouteState({ isAuthenticated, sessionBootstrap }) {
    if (sessionBootstrap === "pending") return "pending"
    return isAuthenticated ? "allow" : "redirect"
}
