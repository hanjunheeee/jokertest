// 로비 UI 층 (위 프로필·가운데 메뉴를 감싸 영상 뒤에 나타나게 함)
// LobbyPage가 씀
import { motion } from "framer-motion"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

// 안 보일 땐 아래로 내린 채 투명하게 두고 눌리지 않게 막음 (데스크톱 LobbyContentLayer와 같은 움직임)
export default function RevealLayer({ visible, children }) {
    return (
        <motion.div
            className="relative z-10 flex flex-1 flex-col gap-3 px-4 pb-3 pt-3 land:gap-2 land:pt-2 md:gap-6 md:px-8 md:pt-6"
            initial={{ opacity: 0, y: 10 }}
            animate={visible ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
            transition={UI_REVEAL_TRANSITION}
            style={{ pointerEvents: visible ? "auto" : "none" }}
        >
            {children}
        </motion.div>
    )
}
