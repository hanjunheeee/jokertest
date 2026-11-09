// 로비 메뉴 버튼 줄 (게임플레이·설정·상점·서고·로그아웃·고객센터) + 고객센터가 여는 문의 창
// MenuArea가 씀
import { LOBBY_MENU_ITEMS } from "@/domains/lobby/constants/lobbyMenu.js"
import { useLobbyMenuNav } from "@/domains/lobby/hooks/useLobbyMenuNav.js"
import MenuItemButton from "@m/domains/lobby/components/menu/MenuItemButton.jsx"
import InquirySheet from "@m/domains/inquiry/InquirySheet.jsx"

// 메뉴 표·누름 처리는 데스크톱 것 그대로, 세로는 한 열·폰 가로는 두 열
// 고객센터도 보통 버튼으로 그림 (게임 안 문의 창을 엶)
export default function MenuNav() {
    const { activeMenu, handleMenuClick, inquiryOpen, inquiryTargetId, closeInquiry } = useLobbyMenuNav()

    return (
        <>
            <nav
                aria-label="로비 메뉴"
                className="flex w-full flex-col items-center gap-[clamp(0.2rem,1.35svh,0.75rem)] land:grid land:w-auto land:grid-cols-2 land:gap-x-3.5 land:gap-y-1 md:gap-[clamp(0.4rem,1.35svh,1rem)]"
            >
                {LOBBY_MENU_ITEMS.map((item) => (
                    <MenuItemButton
                        key={item.id}
                        item={item}
                        isActive={activeMenu === item.id}
                        onSelect={handleMenuClick}
                    />
                ))}
            </nav>
            <InquirySheet open={inquiryOpen} targetId={inquiryTargetId} onClose={closeInquiry} />
        </>
    )
}
