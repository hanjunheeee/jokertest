// 로비 메뉴 버튼 줄 (게임플레이·설정·상점·서고·로그아웃·고객센터)
// MenuArea가 씀
import { LOBBY_MENU_ITEMS } from "@/domains/lobby/constants/lobbyMenu.js"
import { CUSTOMER_SUPPORT_MENU_ID, useLobbyMenuNav } from "@/domains/lobby/hooks/useLobbyMenuNav.js"
import MenuItemButton from "@m/domains/lobby/components/menu/MenuItemButton.jsx"

// 메뉴 표·누름 처리는 데스크톱 것 그대로, 세로는 한 열·폰 가로는 두 열
export default function MenuNav() {
    const { activeMenu, handleMenuClick, supportUrl } = useLobbyMenuNav()

    return (
        <nav
            aria-label="로비 메뉴"
            className="flex flex-col items-center gap-[clamp(0.25rem,1.6svh,1rem)] land:grid land:grid-cols-2 land:gap-x-4 land:gap-y-1 md:gap-5"
        >
            {LOBBY_MENU_ITEMS.map((item) => (
                <MenuItemButton
                    key={item.id}
                    item={item}
                    isActive={activeMenu === item.id}
                    isSupport={item.id === CUSTOMER_SUPPORT_MENU_ID}
                    supportUrl={supportUrl}
                    onSelect={handleMenuClick}
                />
            ))}
        </nav>
    )
}
