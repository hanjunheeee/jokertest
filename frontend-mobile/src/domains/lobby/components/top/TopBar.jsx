// 로비 위 띠 (내 프로필 배너)
// LobbyPage가 씀
import ProfileBanner from "@m/domains/lobby/components/top/ProfileBanner.jsx"

// 데스크톱처럼 오른쪽 위에 둠, 프로필 받기 전엔 배너 자리만 비워 둠 (데스크톱은 안 그림, 모바일은 아래 메뉴가 안 튀게)
export default function TopBar({ profile, loading, onMyPage, onAccount }) {
    const ready = !loading && profile

    return (
        <header className="flex items-center justify-end pt-[3%]">
            <div className="min-w-0 w-[min(100%,26rem)] land:max-w-[19rem]">
                {ready ? (
                    <ProfileBanner profile={profile} onMyPage={onMyPage} onAccount={onAccount} />
                ) : (
                    <div className="aspect-[393/91] w-full" aria-hidden="true" />
                )}
            </div>
        </header>
    )
}
