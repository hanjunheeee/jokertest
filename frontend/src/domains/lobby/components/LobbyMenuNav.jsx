import { LOBBY_ASSETS } from "@/domains/lobby/constants/lobbyAssets.js"
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

/** 지원 URL이 아직 설정되지 않았을 때 버튼에 남기는 안내입니다(대체 URL을 쓰지 않습니다). */
export const LOBBY_SUPPORT_LINK_UNSET_HINT = "고객센터 연결이 아직 설정되지 않았습니다."

// 로비 왼쪽 메뉴 버튼들을 렌더링하는 컴포넌트입니다.
// 메뉴 클릭 처리와 선택 상태는 useLobbyMenuNav 훅이 담당합니다.
export default function LobbyMenuNav() {
  const { activeMenu, handleMenuClick, supportUrl } = useLobbyMenuNav()

  return (
    <nav className={LOBBY_MENU_NAV_CLASS} aria-label="로비 메뉴">
      {LOBBY_MENU_ITEMS.map((item) => {
        // 현재 선택된 메뉴에는 aria-current를 붙여 화면 읽기 프로그램도 상태를 알 수 있게 합니다.
        const isActive = activeMenu === item.id
        const isCustomerSupport = item.id === LOBBY_CUSTOMER_SUPPORT_MENU_ID

        // 고객센터 프레임과 Discord 로고는 항상 같은 하나의 요소 안에 둡니다 — 별도의
        // 고객센터 버튼이나 페이지를 새로 만들지 않습니다(AC-02).
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
          // F-18 AC-03: 실제 지원 URL이 확인됐을 때만 링크가 됩니다. 미설정·잘못된 설정에는
          // href를 만들지 않고(외부 이동 없음) 같은 자리·같은 모습의 비활성 버튼으로 둡니다.
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
