// 로비 메뉴 누름 처리 (화면 이동·종료는 로그아웃·고객센터 주소)
// LobbyMenuNav가 씀
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { logoutApi } from "@/domains/auth/api/auth.api"
import { useAuthStore } from "@/domains/auth/store/auth.store"
import { LOBBY_MENU_ROUTES } from "@/domains/lobby/constants/lobbyMenu.js"
import { resolveDiscordSupportUrl } from "@/shared/discordSupport.js"
import { DISCORD_SUPPORT_URL } from "@/shared/env.js"

// 서버 로그아웃 실패 때 묻는 글 (확인 = 이 기기에서만 로그아웃)
const LOGOUT_FAILED_CONFIRM =
  "로그아웃 요청이 실패했습니다. 이 기기 화면에서만 로그아웃할까요? (새로고침하면 다시 로그인될 수 있습니다) 취소를 누르면 그대로 남아 다시 시도할 수 있습니다."

// 고객센터 메뉴 id (링크로 열려 누름 처리에서 뺌)
export const CUSTOMER_SUPPORT_MENU_ID = "customerSupport"

// 지금 고른 메뉴·누름 처리·고객센터 주소를 줌
export function useLobbyMenuNav() {
  const navigate = useNavigate()

  const [activeMenu, setActiveMenu] = useState("gameplay")

  // 디스코드 고객센터 주소는 한 번만 계산
  const supportUrl = useMemo(() => resolveDiscordSupportUrl(DISCORD_SUPPORT_URL), [])

  const handleMenuClick = async (itemId) => {
    // 고객센터는 링크가 직접 엶
    if (itemId === CUSTOMER_SUPPORT_MENU_ID) return

    setActiveMenu(itemId)

    // 종료: 서버 로그아웃이 실패하면 쿠키 세션이 살아 있어 새로고침 때 다시 로그인됨 → 알리고 고르게 함
    if (itemId === "exit") {
      try {
        await logoutApi()
      } catch {
        const localOnly = typeof window.confirm === "function" && window.confirm(LOGOUT_FAILED_CONFIRM)
        if (!localOnly) return
      }
      useAuthStore.getState().logout()
      navigate("/login")
      return
    }

    // 나머지는 경로 표대로 이동 (표에 없으면 그대로)
    const route = LOBBY_MENU_ROUTES[itemId]
    if (route) navigate(route)
  }

  return { activeMenu, handleMenuClick, supportUrl }
}
