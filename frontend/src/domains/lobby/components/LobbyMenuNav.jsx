// 로비 메뉴 버튼 줄 (게임플레이·설정·상점·서고·종료·고객센터) + 고객센터가 여는 문의 창
// LobbyMenuArea가 씀
import { LOBBY_MENU_ITEMS } from "@/domains/lobby/constants/lobbyMenu.js"
import {
  LOBBY_MENU_BTN_CLASS,
  CUSTOMER_BTN_CLASS,
  LOBBY_MENU_IMG_CLASS,
  LOBBY_MENU_NAV_CLASS,
} from "@/domains/lobby/constants/lobbyMenuStyle.js"
import {
  CUSTOMER_SUPPORT_MENU_ID,
  useLobbyMenuNav,
} from "@/domains/lobby/hooks/useLobbyMenuNav.js"
import InquiryWindow from "@/domains/inquiry/components/InquiryWindow.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"

// 메뉴 표대로 버튼을 그림, 고른 메뉴는 aria-current로 표시
// 고객센터는 디스코드 링크 대신 게임 안 문의 창을 엶 (고른 메뉴 표시 없음)
export default function LobbyMenuNav() {
  const { activeMenu, handleMenuClick, inquiryOpen, inquiryTargetId, closeInquiry } = useLobbyMenuNav()

  return (
    <>
      <nav className={LOBBY_MENU_NAV_CLASS} aria-label="로비 메뉴">
        {LOBBY_MENU_ITEMS.map((item) => {
          const isCustomerSupport = item.id === CUSTOMER_SUPPORT_MENU_ID
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleMenuClick(item.id)}
              aria-current={!isCustomerSupport && activeMenu === item.id ? "page" : undefined}
              aria-label={isCustomerSupport ? item.label : undefined}
              aria-haspopup={isCustomerSupport ? "dialog" : undefined}
              className={isCustomerSupport ? CUSTOMER_BTN_CLASS : LOBBY_MENU_BTN_CLASS}
            >
              <PublicAsset
                src={item.src}
                alt={isCustomerSupport ? "" : item.label}
                className={LOBBY_MENU_IMG_CLASS}
              />
            </button>
          )
        })}
      </nav>
      <InquiryWindow open={inquiryOpen} targetId={inquiryTargetId} onClose={closeInquiry} />
    </>
  )
}
