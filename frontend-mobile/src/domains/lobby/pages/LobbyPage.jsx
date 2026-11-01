// 모바일 로비 화면 (/lobby): 배경·인트로 영상, 위 프로필·재화, 가운데 메뉴, 바닥 알림·친구·소리
// app/routes/index.jsx가 씀
import { useNavigate, useSearchParams } from "react-router-dom"
import { useLobbyIntro } from "@/domains/lobby/hooks/useLobbyIntro.js"
import { useLobbyNotificationPanels } from "@/domains/lobby/hooks/useLobbyNotificationPanels.js"
import { useMyProfile } from "@/shared/hooks/useMyProfile.js"
import { useFriendsReopen } from "@m/domains/lobby/hooks/useFriendsReopen.js"
import LobbyBackground from "@m/domains/lobby/components/LobbyBackground.jsx"
import RevealLayer from "@m/domains/lobby/components/RevealLayer.jsx"
import TopBar from "@m/domains/lobby/components/top/TopBar.jsx"
import MenuArea from "@m/domains/lobby/components/menu/MenuArea.jsx"
import BottomBar from "@m/domains/lobby/components/bottom/BottomBar.jsx"
import FriendsSheet from "@m/domains/lobby/components/friends/FriendsSheet.jsx"
import NotificationSheet from "@m/domains/notifications/components/NotificationSheet.jsx"

// 열림 상태·주소 대상 처리는 데스크톱 훅 그대로, 배치만 모바일 한 열
export default function LobbyPage() {
    const navigate = useNavigate()
    const [searchParams] = useSearchParams()
    const { profile, loading: profileLoading } = useMyProfile()
    const { bgVideoRef, uiVisible, skipIntro } = useLobbyIntro()
    const panels = useLobbyNotificationPanels({ searchParams, navigate })
    useFriendsReopen(panels)

    return (
        <div className="relative flex min-h-full flex-col">
            <LobbyBackground bgVideoRef={bgVideoRef} uiVisible={uiVisible} onSkipIntro={skipIntro} />

            <RevealLayer visible={uiVisible}>
                <TopBar
                    profile={profile}
                    loading={profileLoading}
                    onMyPage={() => navigate("/mypage")}
                    onAccount={() => navigate("/account")}
                />
                <MenuArea />
            </RevealLayer>

            {/* 영상 끝나기 전엔 바닥 줄도 숨김 (데스크톱은 UI 층 전체를 숨김) */}
            {uiVisible ? (
                <BottomBar
                    notificationsOpen={panels.notificationsOpen}
                    onOpenNotifications={panels.openNotifications}
                    friendListOpen={panels.friendListOpen}
                    onOpenFriendList={panels.openFriendList}
                />
            ) : null}

            <FriendsSheet open={panels.friendListOpen} onClose={panels.closeFriendList} />
            <NotificationSheet open={panels.notificationsOpen} onClose={panels.closeNotifications} />
        </div>
    )
}
