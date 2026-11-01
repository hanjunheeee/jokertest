// 로비 바닥 줄 (왼쪽 알림 버튼, 오른쪽 친구 버튼·소리 조절)
// LobbyPage가 화면 틀 바닥 자리(ShellBottom)에 넣음
import { motion } from "framer-motion"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"
import ShellBottom from "@m/shared/ui/ShellBottom.jsx"
import NotificationButton from "@m/domains/lobby/components/bottom/NotificationButton.jsx"
import FriendsButton from "@m/domains/lobby/components/bottom/FriendsButton.jsx"
import SoundControl from "@m/shared/ui/sound/SoundControl.jsx"

// 데스크톱처럼 알림은 왼쪽 구석, 친구·소리는 오른쪽 구석 (폰은 위아래 대신 한 줄로), 바탕은 투명
export default function BottomBar({ notificationsOpen, onOpenNotifications, friendListOpen, onOpenFriendList }) {
    return (
        <ShellBottom>
            <motion.div
                className="relative z-10 flex items-end justify-between gap-2 px-3 pb-2 pt-1 land:px-6 land:pb-1 md:px-8 md:pb-4"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={UI_REVEAL_TRANSITION}
            >
                <NotificationButton open={notificationsOpen} onOpen={onOpenNotifications} />
                <div className="flex min-w-0 items-center gap-2">
                    <FriendsButton open={friendListOpen} onOpen={onOpenFriendList} />
                    <SoundControl look="lobby" />
                </div>
            </motion.div>
        </ShellBottom>
    )
}
