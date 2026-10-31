import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { logoutApi } from "@/domains/auth/api/auth.api"
import { useAuthStore } from "@/domains/auth/store/auth.store"
import { LOBBY_MENU_ROUTES } from "@/domains/lobby/constants/lobbyMenu.js"
import { resolveDiscordSupportUrl } from "@/shared/discordSupport.js"
import { DISCORD_SUPPORT_URL } from "@/shared/env.js"

export const LOBBY_CUSTOMER_SUPPORT_MENU_ID = "customerSupport"

export function useLobbyMenuNav() {
  const navigate = useNavigate()

  const [activeMenu, setActiveMenu] = useState("gameplay")

  const supportUrl = useMemo(() => resolveDiscordSupportUrl(DISCORD_SUPPORT_URL), [])

  const handleMenuClick = async (itemId) => {
    if (itemId === LOBBY_CUSTOMER_SUPPORT_MENU_ID) return

    setActiveMenu(itemId)

    if (itemId === "exit") {
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
