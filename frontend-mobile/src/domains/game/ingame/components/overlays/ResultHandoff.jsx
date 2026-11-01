// 결과 화면 넘김 막: 판이 끝나고 승패가 오면 결과 화면으로 옮기기 직전까지 판을 어둡게 덮음
// OverlayLayer가 씀, 실제 이동은 useInGameResultNavigation(useOverlayLayer 안)이 앞 연출 끝난 뒤 함
import { motion } from "framer-motion"
import { useInGameStore } from "@/domains/game/ingame/store/ingameStore.js"
import { DARK_MSG_CLASS } from "./overlayText.js"

// 추방·밤 성공 연출(z 70)보다 아래, 판(틀)보다 위
export default function ResultHandoff() {
    const ended = useInGameStore((s) => s.state?.phase === "ENDED" && Boolean(s.state?.winResult))
    if (!ended) return null

    return (
        <motion.div
            className="fixed inset-0 z-[54] flex items-center justify-center bg-black/80"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35 }}
            role="status"
            data-ingame-result-handoff=""
        >
            <p className={DARK_MSG_CLASS}>게임이 끝났습니다</p>
        </motion.div>
    )
}
