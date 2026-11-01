// 앱 시작 때 서버 세션으로 로그인 상태 맞추기, 보호 화면 통과 여부 고르기
// app/App.jsx가 시작 때 부름, shared/ui/ProtectedRoute.jsx가 resolveProtectedRouteState 사용

// 서버 세션이 기준: 같은 계정이면 유지, 다른 계정이면 바꿈, 실패면 로그아웃
export async function bootstrapSession({ getMe, getMyProfile, store }) {
    // 확인하는 동안 보호 화면은 기다림
    store.getState().setSessionBootstrap("pending")
    try {
        // uuid 없는 응답은 세션 없음으로 봄
        const me = await getMe()
        const uuid = typeof me?.uuid === "string" ? me.uuid : null
        if (!uuid) throw new Error("서버 세션 응답에 uuid가 없다")

        // 저장된 계정과 같으면 그대로, role만 서버 값으로
        const persisted = store.getState().user
        if (persisted?.uuid === uuid) {
            if (persisted.role !== me.role) store.getState().adoptRole(me.role)
            return { outcome: "kept", uuid }
        }

        // 저장된 게 없거나 다른 계정이면 닉네임 받아 새로 로그인
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
        // 확인 실패(세션 없음·통신 실패)면 로그아웃
        store.getState().logout()
        return { outcome: "logged-out", uuid: null }
    } finally {
        // 성공·실패 상관없이 확인 끝
        store.getState().setSessionBootstrap("done")
    }
}

// 확인 중(pending)만 기다림, idle·done이면 로그인 여부로 통과·로그인 화면
export function resolveProtectedRouteState({ isAuthenticated, sessionBootstrap }) {
    if (sessionBootstrap === "pending") return "pending"
    return isAuthenticated ? "allow" : "redirect"
}
