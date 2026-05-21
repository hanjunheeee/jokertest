import { motion } from "framer-motion"
import { MY_PAGE_ASSETS, MY_PAGE_PROFILE } from "../../assets/myPageAssets.js"
import MyPageBannerButton from "../lobby/MyPageBannerButton.jsx"
import PublicAsset from "../login/PublicAsset.jsx"
import BloodRecordFrame from "./BloodRecordFrame.jsx"
import FateMaskFooter, { FATE_MASK_FOOTER_SPACE } from "./FateMaskFooter.jsx"

const UI_FADE = { duration: 0.7, ease: [0.22, 1, 0.36, 1] }

/**
 * prototype 프로필 페이지.png — 친구목록 UI 제외
 * 중앙: 프로필 + 명성 배너 + 피의 기록 / 하단 고정: 운명의 가면
 */
export default function MyPageLayout() {
  return (
    <>
      <motion.main
        className="relative z-10 flex min-h-svh w-full items-center justify-center px-[clamp(1rem,3vw,2rem)] pt-[clamp(2.5rem,6vh,4.5rem)]"
        style={{ paddingBottom: FATE_MASK_FOOTER_SPACE }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={UI_FADE}
      >
        <div className="flex items-center justify-center gap-[clamp(1.25rem,2.8vw,2.25rem)]">
          <div className="relative w-[clamp(17rem,27vw,25rem)] shrink-0">
            <PublicAsset
              src={MY_PAGE_ASSETS.profilePhoto}
              alt=""
              className="absolute left-1/2 top-[51%] z-0 h-[80%] w-[76%] -translate-x-1/2 -translate-y-1/2 object-contain object-center"
            />
            <PublicAsset
              src={MY_PAGE_ASSETS.profileFrame}
              alt=""
              className="relative z-10 block h-auto w-full select-none"
            />
          </div>

          <div className="flex w-[clamp(20rem,32vw,36rem)] shrink-0 flex-col items-start gap-[clamp(0.65rem,1.4vh,1rem)]">
            <MyPageBannerButton
              showText
              profile={MY_PAGE_PROFILE}
              bannerSrc={MY_PAGE_ASSETS.reputationBanner}
            />
            <BloodRecordFrame />
          </div>
        </div>
      </motion.main>

      <FateMaskFooter />
    </>
  )
}
