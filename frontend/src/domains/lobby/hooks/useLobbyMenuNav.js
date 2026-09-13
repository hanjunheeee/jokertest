import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { logoutApi } from "@/domains/auth/api/auth.api"
import { useAuthStore } from "@/domains/auth/store/auth.store"
import { LOBBY_MENU_ROUTES } from "@/domains/lobby/constants/lobbyMenu.js"
import { resolveDiscordSupportUrl } from "@/shared/discordSupport.js"
import { DISCORD_SUPPORT_URL } from "@/shared/env.js"

/** 고객센터 메뉴 id — 외부 Discord 지원 링크라 내부 이동 경로와 다르게 다룬다(F-18 AC-03). */
export const LOBBY_CUSTOMER_SUPPORT_MENU_ID = "customerSupport"

// 로비 메뉴의 선택 상태와 클릭 동작을 관리하는 훅입니다.
export function useLobbyMenuNav() {
  const navigate = useNavigate()

  // 현재 선택된 로비 메뉴 id입니다.
  // 선택된 버튼에 aria-current를 붙일 때 사용합니다.
  const [activeMenu, setActiveMenu] = useState("gameplay")

  // F-18 AC-03: 고객센터가 실제로 열 외부 목적지입니다. 설정(VITE_DISCORD_SUPPORT_URL)이
  // 없거나 지원 목적지 규칙을 만족하지 못하면 null이고, 그때는 링크를 만들지 않습니다 —
  // 추측한 초대 URL이나 OAuth 주소를 대신 쓰지 않습니다(A-04). 빌드 타임 상수라 한 번만
  // 판정하면 됩니다.
  const supportUrl = useMemo(() => resolveDiscordSupportUrl(DISCORD_SUPPORT_URL), [])

  // 메뉴 버튼을 눌렀을 때 선택 상태를 바꾸고, 메뉴에 맞는 페이지로 이동합니다.
  const handleMenuClick = async (itemId) => {
    // 고객센터는 앱 내부 이동이 아니라 외부 링크(a 태그)가 담당합니다 — 선택 표시
    // (aria-current)도 붙이지 않으므로 여기서 먼저 갈라냅니다.
    if (itemId === LOBBY_CUSTOMER_SUPPORT_MENU_ID) return

    setActiveMenu(itemId)

    if (itemId === "exit") {
      // 서버 로그아웃 요청이 실패해도 클라이언트 로그인 상태는 비우고 로그인 화면으로 보냅니다.
      await logoutApi().catch(() => {})
      useAuthStore.getState().logout()
      navigate("/login")
      return
    }

    const route = LOBBY_MENU_ROUTES[itemId]
    if (route) navigate(route)
  }

  return { activeMenu, handleMenuClick, supportUrl }
}
