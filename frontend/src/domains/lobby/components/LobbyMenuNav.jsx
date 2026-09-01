import { LOBBY_ASSETS } from "@/domains/lobby/constants/lobbyAssets.js"
import { LOBBY_MENU_ITEMS } from "@/domains/lobby/constants/lobbyMenu.js"
import {
  LOBBY_MENU_BTN_CLASS,
  LOBBY_MENU_CUSTOMER_BTN_CLASS,
  LOBBY_MENU_DISCORD_IMG_CLASS,
  LOBBY_MENU_IMG_CLASS,
  LOBBY_MENU_NAV_CLASS,
} from "@/domains/lobby/constants/lobbyMenuStyle.js"
import { useLobbyMenuNav } from "@/domains/lobby/hooks/useLobbyMenuNav.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 로비 왼쪽 메뉴 버튼들을 렌더링하는 컴포넌트입니다.
// 메뉴 클릭 처리와 선택 상태는 useLobbyMenuNav 훅이 담당합니다.
export default function LobbyMenuNav() {
  const { activeMenu, handleMenuClick } = useLobbyMenuNav()

  return (
    <nav className={LOBBY_MENU_NAV_CLASS} aria-label="로비 메뉴">
      {LOBBY_MENU_ITEMS.map((item) => {
        // 현재 선택된 메뉴에는 aria-current를 붙여 화면 읽기 프로그램도 상태를 알 수 있게 합니다.
        const isActive = activeMenu === item.id
        const isCustomerSupport = item.id === "customerSupport"

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => handleMenuClick(item.id)}
            aria-current={isActive ? "page" : undefined}
            aria-label={isCustomerSupport ? item.label : undefined}
            className={isCustomerSupport ? LOBBY_MENU_CUSTOMER_BTN_CLASS : LOBBY_MENU_BTN_CLASS}
          >
            <PublicAsset
              src={item.src}
              alt={isCustomerSupport ? "" : item.label}
              className={LOBBY_MENU_IMG_CLASS}
            />
            {isCustomerSupport ? (
              <PublicAsset
                src={LOBBY_ASSETS.discordLogo}
                alt=""
                className={LOBBY_MENU_DISCORD_IMG_CLASS}
              />
            ) : null}
          </button>
        )
      })}
    </nav>
  )
}
