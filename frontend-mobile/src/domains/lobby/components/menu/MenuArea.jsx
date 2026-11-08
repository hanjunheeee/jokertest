// 로비 가운데 영역 (로고 + 메뉴 버튼)
// LobbyPage가 씀
import { LOBBY_ASSETS } from "@/shared/constants/lobbyAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import MenuNav from "@m/domains/lobby/components/menu/MenuNav.jsx"

// 세로: 로고 위·메뉴 아래 한 열(가운데 정렬), 폰 가로: 로고 왼쪽·메뉴 오른쪽
export default function MenuArea() {
    return (
        <section className="flex flex-1 flex-col items-center justify-center gap-[clamp(0.6rem,2.4svh,1.45rem)] land:flex-row land:items-center land:justify-center land:gap-4">
            <PublicAsset
                src={LOBBY_ASSETS.logo}
                alt="The Joker"
                className="pointer-events-none mx-auto h-auto w-[min(78vw,19.5rem)] select-none short:w-[min(66vw,16.5rem)] land:mx-0 land:w-[min(38vw,16.5rem)] md:w-[min(24rem,42svh)]"
            />
            <MenuNav />
        </section>
    )
}
