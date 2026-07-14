import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { logoutApi } from "@/domains/auth/api/auth.api"
import { useAuthStore } from "@/domains/auth/store/auth.store"
import { LOBBY_MENU_ROUTES } from "@/domains/lobby/constants/lobbyMenu.js"

// 로비 메뉴의 선택 상태와 클릭 동작을 관리하는 훅입니다.
export function useLobbyMenuNav() {
  const navigate = useNavigate()

  // 현재 선택된 로비 메뉴 id입니다.
  // 선택된 버튼에 aria-current를 붙일 때 사용합니다.
  const [activeMenu, setActiveMenu] = useState("gameplay")

  // 메뉴 버튼을 눌렀을 때 선택 상태를 바꾸고, 메뉴에 맞는 페이지로 이동합니다.
  const handleMenuClick = async (itemId) => {
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

  return { activeMenu, handleMenuClick }
}
