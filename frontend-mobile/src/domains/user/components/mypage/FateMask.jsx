// 운명의 가면 틀 (틀 그림 + 대표 직업 문구, 강조 낱말은 대괄호)
// MyPage가 씀, 데스크톱 FateMaskFooter·FateMaskDescription 합친 모양

import { motion } from "framer-motion"
import { MY_PAGE_ASSETS } from "@/domains/user/constants/myPageAssets.js"
import {
    FATE_MASK_DESC_INSET,
    FATE_MASK_FRAME_IMG_CLASS,
    FATE_MASK_HIGHLIGHT_CLASS,
    FATE_MASK_TEXT_SHADOW,
    FATE_MASK_UI_FADE,
} from "@/domains/user/constants/myPageLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 데스크톱 FATE_MASK_DESC_CLASS와 같은 글꼴·색·크기, 폰 폭에선 한 줄에 안 들어가서 낱말 단위 줄바꿈만 다름
const DESC_CLASS =
    "pointer-events-none absolute flex items-end justify-center break-keep pb-[0.18em] text-center font-subheading app-text-scaled [--app-text-size:max(0.75rem,3.1cqi)] font-bold leading-[1.55] text-[#e8e4dc]"

// 나타나는 움직임만 있고 누를 것 없음, 화면 읽기에서 숨김 (데스크톱과 같음)
export default function FateMask({ description }) {
    const { prefix, highlight, suffix } = description

    return (
        <motion.div
            className="pointer-events-none relative w-full [container-type:inline-size]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={FATE_MASK_UI_FADE}
            aria-hidden="true"
        >
            <PublicAsset src={MY_PAGE_ASSETS.fateMaskFrame} alt="" className={FATE_MASK_FRAME_IMG_CLASS} />

            <p className={DESC_CLASS} style={{ ...FATE_MASK_DESC_INSET, textShadow: FATE_MASK_TEXT_SHADOW }}>
                <span>
                    {prefix ? `${prefix} ` : null}
                    <span className={FATE_MASK_HIGHLIGHT_CLASS}>[{highlight}]</span>
                    {suffix}
                </span>
            </p>
        </motion.div>
    )
}
