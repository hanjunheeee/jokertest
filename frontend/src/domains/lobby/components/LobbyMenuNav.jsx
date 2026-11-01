import { LOBBY_ASSETS } from "@/shared/constants/lobbyAssets.js"
import { LOBBY_MENU_ITEMS } from "@/domains/lobby/constants/lobbyMenu.js"
import {
  LOBBY_MENU_BTN_CLASS,
  LOBBY_MENU_CUSTOMER_BTN_CLASS,
  LOBBY_MENU_DISCORD_IMG_CLASS,
  LOBBY_MENU_IMG_CLASS,
  LOBBY_MENU_NAV_CLASS,
} from "@/domains/lobby/constants/lobbyMenuStyle.js"
import {
  LOBBY_CUSTOMER_SUPPORT_MENU_ID,
  useLobbyMenuNav,
} from "@/domains/lobby/hooks/useLobbyMenuNav.js"
import PublicAsset from "@/shared/ui/PublicAsset"

export const LOBBY_SUPPORT_LINK_UNSET_HINT = "고객센터 연결이 아직 설정되지 않았습니다."

export default function LobbyMenuNav() {
  const { activeMenu, handleMenuClick, supportUrl } = useLobbyMenuNav()

  return (
    <nav className={LOBBY_MENU_NAV_CLASS} aria-label="로비 메뉴">
      {LOBBY_MENU_ITEMS.map((item) => {
        const isActive = activeMenu === item.id
        const isCustomerSupport = item.id === LOBBY_CUSTOMER_SUPPORT_MENU_ID

        const content = (
          <>
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
          </>
        )

        if (isCustomerSupport) {
          return supportUrl ? (
            <a
              key={item.id}
              href={supportUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={item.label}
              className={LOBBY_MENU_CUSTOMER_BTN_CLASS}
            >
              {content}
            </a>
          ) : (
            <button
              key={item.id}
              type="button"
              disabled
              aria-label={item.label}
              title={LOBBY_SUPPORT_LINK_UNSET_HINT}
              className={LOBBY_MENU_CUSTOMER_BTN_CLASS}
            >
              {content}
            </button>
          )
        }

        return (
          <button
            key={item.id}
            type="button"
            onClick={() => handleMenuClick(item.id)}
            aria-current={isActive ? "page" : undefined}
            className={LOBBY_MENU_BTN_CLASS}
          >
            {content}
          </button>
        )
      })}
    </nav>
  )
}
