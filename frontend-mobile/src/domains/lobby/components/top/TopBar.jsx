// 로비 위 띠 (왼쪽 내 프로필 배너, 오른쪽 보유 재화)
// LobbyPage가 씀
import { useWallet } from "@m/domains/lobby/hooks/useWallet.js"
import ProfileBanner from "@m/domains/lobby/components/top/ProfileBanner.jsx"
import CurrencyBalance from "@m/domains/lobby/components/top/CurrencyBalance.jsx"

// 프로필 받기 전엔 배너 자리만 비워 둠 (데스크톱은 안 그림, 모바일은 아래 메뉴가 안 튀게)
export default function TopBar({ profile, loading, onMyPage, onAccount }) {
    const wallet = useWallet()
    const ready = !loading && profile

    return (
        <header className="flex items-center gap-2 pt-[3%] md:gap-4">
            <div className="min-w-0 flex-1 md:max-w-[26rem] land:max-w-[19rem]">
                {ready ? (
                    <ProfileBanner profile={profile} onMyPage={onMyPage} onAccount={onAccount} />
                ) : (
                    <div className="aspect-[393/91] w-full" aria-hidden="true" />
                )}
            </div>
            <CurrencyBalance {...wallet} />
        </header>
    )
}
