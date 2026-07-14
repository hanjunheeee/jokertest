import { useEffect } from "react"
import { Navigate, Outlet } from "react-router-dom"
import {
    selectIsAuthenticated,
    selectLoggedOutIntentionally,
    useAuthStore,
} from "@/domains/auth/store/auth.store"

// 로그인한 사용자만 통과시켜야 하는 라우트를 감싸는 컴포넌트입니다.
export default function ProtectedRoute() {
    // 로그인 여부입니다. true면 보호된 페이지를 보여줄 수 있습니다.
    const isAuthenticated = useAuthStore(selectIsAuthenticated)

    // 사용자가 직접 로그아웃해서 로그인 페이지로 온 상황인지 구분하는 값입니다.
    const loggedOutIntentionally = useAuthStore(selectLoggedOutIntentionally)

    useEffect(() => {
        // 이미 로그인된 상태면 경고를 띄울 필요가 없습니다.
        if (isAuthenticated) return

        // 사용자가 직접 로그아웃한 경우에는 자연스럽게 로그인 페이지로 보내고 경고는 띄우지 않습니다.
        if (loggedOutIntentionally) return

        // alert 같은 동작은 화면을 그리는 중에 실행하지 않고, 렌더가 끝난 뒤 useEffect에서 실행합니다.
        alert("로그인이 필요한 페이지입니다!")
    }, [isAuthenticated, loggedOutIntentionally])

    if (!isAuthenticated) {
        // 로그인하지 않았다면 로그인 페이지로 보냅니다.
        // replace는 뒤로가기를 눌렀을 때 보호된 페이지와 로그인 페이지를 반복하지 않게 합니다.
        return <Navigate to="/login" replace />
    }

    // 인증을 통과하면 이 위치에 실제 자식 라우트가 렌더링됩니다.
    // 예: 로비, 게임 화면 등 ProtectedRoute 아래에 선언된 페이지들입니다.
    return <Outlet />
}
