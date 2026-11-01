// 운명의 가면 틀 (틀 그림 + 대표 직업 문구, 강조 낱말은 대괄호)
// MyPage가 씀, 데스크톱 FateMaskFooter·FateMaskDescription 합친 모양

import { motion } from "framer-motion"
import { MY_PAGE_ASSETS } from "@/domains/user/constants/myPageAssets.js"
import {
    FATE_MASK_DESC_INSET,
    FATE_MASK_HIGHLIGHT_CLASS,
    FATE_MASK_TEXT_SHADOW,
    FATE_MASK_UI_FADE,
} from "@/domains/user/constants/myPageLayoutStyle.js"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"

// 폰 폭에선 한 줄에 안 들어가서 줄바꿈 허용 (낱말 단위)
export default function FateMask({ description }) {
    const { prefix, highlight, suffix } = description

    return (
        <motion.div
            className="relative w-full [container-type:inline-size]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={FATE_MASK_UI_FADE}
        >
            <PublicAsset src={MY_PAGE_ASSETS.fateMaskFrame} alt="" className="block h-auto w-full select-none" />

            <p
                className="pointer-events-none absolute flex items-center justify-center break-keep text-center font-subheading text-[max(0.8rem,3.6cqi)] font-bold leading-[1.45] text-[#e8e4dc]"
                style={{ ...FATE_MASK_DESC_INSET, textShadow: FATE_MASK_TEXT_SHADOW }}
            >
                <span>
                    {prefix ? `${prefix} ` : null}
                    <span className={FATE_MASK_HIGHLIGHT_CLASS}>[{highlight}]</span>
                    {suffix}
                </span>
            </p>
        </motion.div>
    )
}
