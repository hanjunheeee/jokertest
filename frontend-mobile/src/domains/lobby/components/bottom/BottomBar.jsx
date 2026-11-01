// 로비 바닥 줄 (알림·친구 버튼, 소리 조절, 위에 게임 초대 알림 띠)
// LobbyPage가 화면 틀 바닥 자리(ShellBottom)에 넣음
import { motion } from "framer-motion"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import ShellBottom from "@m/shared/ui/ShellBottom.jsx"
import { usePendingInvites } from "@m/domains/lobby/hooks/usePendingInvites.js"
import NotificationButton from "@m/domains/lobby/components/bottom/NotificationButton.jsx"
import FriendsButton from "@m/domains/lobby/components/bottom/FriendsButton.jsx"
import InviteAlert from "@m/domains/lobby/components/bottom/InviteAlert.jsx"
import SoundControl from "@m/shared/ui/sound/SoundControl.jsx"

// 배경 그림 위에 떠 보이게 바탕은 투명, 버튼 줄만 둠
export default function BottomBar({ notificationsOpen, onOpenNotifications, friendListOpen, onOpenFriendList }) {
    const invites = usePendingInvites()

    return (
        <ShellBottom>
            <motion.div
                className="relative z-10 flex flex-col gap-1.5 px-3 pb-2 pt-1 land:flex-row land:items-center land:justify-between land:gap-3 land:px-6 land:pb-1 md:px-8 md:pb-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={UI_REVEAL_TRANSITION}
            >
                {invites.alertVisible ? (
                    <InviteAlert
                        invite={invites.latest}
                        count={invites.count}
                        onOpen={onOpenFriendList}
                        onDismiss={invites.dismiss}
                    />
                ) : null}

                {/* 폰 가로: 줄을 풀어(contents) 버튼 · 알림 띠 · 소리를 한 줄로 (높이 아끼기) */}
                <div className="flex items-center justify-between gap-2 land:contents">
                    <div className="flex items-center gap-2 land:order-first">
                        <NotificationButton open={notificationsOpen} onOpen={onOpenNotifications} />
                        <FriendsButton open={friendListOpen} onOpen={onOpenFriendList} inviteCount={invites.count} />
                    </div>
                    <SoundControl look="lobby" />
                </div>
            </motion.div>
        </ShellBottom>
    )
}
