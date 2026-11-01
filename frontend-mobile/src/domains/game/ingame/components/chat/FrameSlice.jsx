// 데스크톱 채팅 틀 그림의 한 구간만 칸 크기에 맞춰 깔기 (목록 칸·입력 줄)
// ChatPanel·Composer·CloseupSheet가 씀, 세로 폰은 틀 비율을 못 지켜서 구간별로 늘려 붙임
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import { INGAME_CHAT_ASSETS } from "@/domains/game/ingame/constants/chat/ingameChatAssets.js"
import { FRAME_IMAGE_CLASS, frameSliceStyle } from "./chatStyle.js"

// slice는 chatStyle의 FRAME_SLICE 값 하나
export default function FrameSlice({ slice }) {
    return (
        <PublicAsset
            src={INGAME_CHAT_ASSETS.frame}
            alt=""
            className={FRAME_IMAGE_CLASS}
            style={frameSliceStyle(slice)}
        />
    )
}
