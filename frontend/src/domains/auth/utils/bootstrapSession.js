// 앱이 켜질 때 localStorage에 남은 로그인 상태(auth-storage)를 **서버 세션(쿠키)**과 맞춘다.
//
// 이 앱은 "로그인됐는가"를 저장값(isLoggedIn·user)으로 판단한다. 그래서 두 가지 어긋남이 생긴다:
//   - 쿠키는 살아 있는데 저장값이 없다 → 보호 라우트가 /login으로 보낸다(실제 인수에서 확인).
//   - 저장값의 user.uuid가 쿠키 계정과 다르다 → economy 요청이 그 uuid로 나가 requireSelf 403.
// 그래서 마운트 때 항상 /auth/me로 서버가 누구로 보는지 묻고, 그 uuid·role을 채택한다.
//
// /auth/me는 { uuid, role }만 준다(닉네임 없음). 저장된 user와 uuid가 같으면 저장된 닉네임을
// 그대로 쓰고 세대(identityGeneration)를 올리지 않는다 — 같은 계정이므로 경계 초기화가 필요
// 없다. 다르거나 없으면 /user/me/profile로 닉네임을 받아 login()으로 교체한다(세대가 올라
// economy·profile·achievements의 계정 경계 초기화가 그대로 이어진다).
//
// 실패(401은 client.js가 refresh까지 시도한 뒤 throw)는 곧 "쿠키가 없다"이므로 logout()한다.
// 어느 경우든 끝나면 sessionBootstrap을 "done"으로 둔다 — ProtectedRoute는 "pending" 동안
// 아무것도 그리지 않는다(저장값 없는 유효 쿠키가 /login을 잠깐 스치는 것을 막는다).
export async function bootstrapSession({ getMe, getMyProfile, store }) {
    store.getState().setSessionBootstrap("pending")
    try {
        const me = await getMe()
        const uuid = typeof me?.uuid === "string" ? me.uuid : null
        if (!uuid) throw new Error("서버 세션 응답에 uuid가 없다")

        const persisted = store.getState().user
        if (persisted?.uuid === uuid) {
            // 같은 계정 — role만 최신으로 맞추고 닉네임·세대는 유지한다.
            if (persisted.role !== me.role) store.getState().adoptRole(me.role)
            return { outcome: "kept", uuid }
        }

        let nickname = null
        try {
            const profile = await getMyProfile()
            if (typeof profile?.nickname === "string") nickname = profile.nickname
        } catch {
            // 닉네임 조회 실패는 로그인 자체를 막지 않는다 — 마이페이지 store가 다시 채운다.
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

/**
 * ProtectedRoute가 그릴 것을 정한다(순수 함수).
 *   - "pending": 서버 세션 확인이 끝나기 전 — 아무것도 그리지 않는다(경고도 띄우지 않는다).
 *   - "allow":   인증됨 — 자식 라우트.
 *   - "redirect": 인증 안 됨 — /login.
 * sessionBootstrap이 "idle"(App 밖에서 라우터만 마운트한 시험 등)이면 저장값만으로 판단한다.
 */
export function resolveProtectedRouteState({ isAuthenticated, sessionBootstrap }) {
    if (sessionBootstrap === "pending") return "pending"
    return isAuthenticated ? "allow" : "redirect"
}
