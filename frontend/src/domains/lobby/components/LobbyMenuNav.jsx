// 로비 메뉴 버튼 줄 (게임플레이·설정·상점·서고·종료·고객센터)
// LobbyMenuArea가 씀
import { LOBBY_ASSETS } from "@/shared/constants/lobbyAssets.js"
import { LOBBY_MENU_ITEMS } from "@/domains/lobby/constants/lobbyMenu.js"
import {
  LOBBY_MENU_BTN_CLASS,
  CUSTOMER_BTN_CLASS,
  DISCORD_IMG_CLASS,
  LOBBY_MENU_IMG_CLASS,
  LOBBY_MENU_NAV_CLASS,
} from "@/domains/lobby/constants/lobbyMenuStyle.js"
import {
  CUSTOMER_SUPPORT_MENU_ID,
  useLobbyMenuNav,
} from "@/domains/lobby/hooks/useLobbyMenuNav.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 고객센터 주소가 없을 때 버튼에 띄울 안내
export const SUPPORT_LINK_UNSET_HINT = "고객센터 연결이 아직 설정되지 않았습니다."

// 메뉴 표대로 버튼을 그림, 고른 메뉴는 aria-current로 표시
export default function LobbyMenuNav() {
  const { activeMenu, handleMenuClick, supportUrl } = useLobbyMenuNav()

  return (
    <nav className={LOBBY_MENU_NAV_CLASS} aria-label="로비 메뉴">
      {LOBBY_MENU_ITEMS.map((item) => {
        const isActive = activeMenu === item.id
        const isCustomerSupport = item.id === CUSTOMER_SUPPORT_MENU_ID

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
                className={DISCORD_IMG_CLASS}
              />
            ) : null}
          </>
        )

        // 고객센터: 주소가 있으면 새 창 링크, 없으면 잠긴 버튼에 안내 title
        if (isCustomerSupport) {
          return supportUrl ? (
            <a
              key={item.id}
              href={supportUrl}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={item.label}
              className={CUSTOMER_BTN_CLASS}
            >
              {content}
            </a>
          ) : (
            <button
              key={item.id}
              type="button"
              disabled
              aria-label={item.label}
              title={SUPPORT_LINK_UNSET_HINT}
              className={CUSTOMER_BTN_CLASS}
            >
              {content}
            </button>
          )
        }

        // 나머지 메뉴: 누르면 이동 처리
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
