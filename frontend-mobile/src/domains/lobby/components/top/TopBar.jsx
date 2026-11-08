// 로비 위 띠 (내 프로필 배너)
// LobbyPage가 씀
import ProfileBanner from "@m/domains/lobby/components/top/ProfileBanner.jsx"

// 모바일: 작은 배너를 화면 좌상단에 (RevealLayer 패딩은 음수 마진으로 맞춤)
export default function TopBar({ profile, loading, onMyPage, onAccount }) {
    const ready = !loading && profile

    return (
        <header className="-ml-2 mt-1 flex w-full items-start justify-start land:mt-1.5 md:-ml-6 md:mt-0">
            <div className="min-w-0 w-[min(76vw,14.75rem)] land:w-[min(62vw,12.25rem)]">
                {ready ? (
                    <ProfileBanner profile={profile} onMyPage={onMyPage} onAccount={onAccount} />
                ) : (
                    <div className="aspect-[393/91] w-full" aria-hidden="true" />
                )}
            </div>
        </header>
    )
}
