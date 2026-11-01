// 로비 메뉴 누름 처리 (화면 이동·종료는 로그아웃·고객센터 주소)
// LobbyMenuNav가 씀
import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { logoutApi } from "@/domains/auth/api/auth.api"
import { useAuthStore } from "@/domains/auth/store/auth.store"
import { LOBBY_MENU_ROUTES } from "@/domains/lobby/constants/lobbyMenu.js"
import { resolveDiscordSupportUrl } from "@/shared/discordSupport.js"
import { DISCORD_SUPPORT_URL } from "@/shared/env.js"

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

    // 종료: 서버 로그아웃이 실패해도 로컬 로그아웃 뒤 로그인 화면으로
    if (itemId === "exit") {
      await logoutApi().catch(() => {})
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
