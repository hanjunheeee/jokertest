// 로비 메뉴 버튼 줄 (모바일 패널 2종·게임플레이만 활성 패널) + 고객센터 문의 창
// MenuArea가 씀
import { LOBBY_MENU_ITEMS } from "@/domains/lobby/constants/lobbyMenu.js"
import { useLobbyMenuNav } from "@/domains/lobby/hooks/useLobbyMenuNav.js"
import { LOBBY_MOBILE_MENU_NAV_CLASS } from "@m/domains/lobby/constants/lobbyMobileMenuStyle.js"
import MenuItemButton from "@m/domains/lobby/components/menu/MenuItemButton.jsx"
import InquirySheet from "@m/domains/inquiry/InquirySheet.jsx"

// 메뉴 표·누름 처리는 데스크톱 것 그대로, 세로는 한 열·폰 가로는 두 열
// 고객센터도 보통 버튼으로 그림 (게임 안 문의 창을 엶)
export default function MenuNav() {
    const { handleMenuClick, inquiryOpen, inquiryTargetId, closeInquiry } = useLobbyMenuNav()

    return (
        <>
            <nav aria-label="로비 메뉴" className={LOBBY_MOBILE_MENU_NAV_CLASS}>
                {LOBBY_MENU_ITEMS.map((item) => (
                    <MenuItemButton key={item.id} item={item} onSelect={handleMenuClick} />
                ))}
            </nav>
            <InquirySheet open={inquiryOpen} targetId={inquiryTargetId} onClose={closeInquiry} />
        </>
    )
}
