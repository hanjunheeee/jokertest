// 로비 가운데 영역 (로고 + 메뉴 버튼)
// LobbyPage가 씀
import { LOBBY_ASSETS } from "@/shared/constants/lobbyAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import MenuNav from "@m/domains/lobby/components/menu/MenuNav.jsx"

// 세로: 로고 위·메뉴 아래 한 열, 폰 가로: 로고 왼쪽·메뉴 오른쪽
export default function MenuArea() {
    return (
        <section className="flex flex-1 flex-col items-center justify-center gap-[clamp(0.75rem,3svh,2rem)] land:flex-row land:justify-around land:gap-4">
            <PublicAsset
                src={LOBBY_ASSETS.logo}
                alt="The Joker"
                className="pointer-events-none h-auto w-[min(58vw,15rem)] select-none short:w-[min(46vw,12rem)] land:w-[min(30vw,13rem)] md:w-[min(22rem,34svh)]"
            />
            <MenuNav />
        </section>
    )
}
