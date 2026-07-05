/**
 * 마이페이지 레이아웃.
 *
 * 프로필 배너, 기록 프레임, 하단 장식 컴포넌트를 한 화면 비율에 맞춰 배치합니다.
 */
import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import { MY_PAGE_ASSETS } from "../constants/myPageAssets.js"
import MyPageBannerButton from "@/domains/user/components/MyPageBannerButton.jsx"
import PublicAsset from "@/shared/ui/PublicAsset.jsx"
import BloodRecordFrame from "./BloodRecordFrame.jsx"
import FateMaskFooter from "./FateMaskFooter.jsx"
import { useMyProfile } from "../hooks/useMyProfile.js"

const UI_FADE = { duration: 0.7, ease: [0.22, 1, 0.36, 1] }

/** 프로필 배너·피의 기록·운명의 가면 등 마이페이지 하위 컴포넌트를 배치 */
export default function MyPageLayout() {
  const navigate = useNavigate()
  // useMyProfile 훅이 서버에서 프로필을 가져와 각 하위 컴포넌트가 바로 쓸 수 있는
  // 형태(profile/stats/description)로 가공해 돌려줌. loading이 true인 동안은 렌더링을 미룸
  const { profile, stats, description, loading } = useMyProfile()

  return (
    <div className="relative z-10 flex h-full min-h-0 flex-col">
      <motion.main
        className="relative flex min-h-0 flex-1 items-center justify-center px-[clamp(1rem,3vw,2rem)] pt-[clamp(2.5rem,6vh,4.5rem)] pb-[clamp(0.25rem,1vh,0.75rem)]"
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
            {!loading && profile ? (
              <>
                <MyPageBannerButton
                  showText
                  profile={profile}
                  bannerSrc={MY_PAGE_ASSETS.reputationBanner}
                />
                <BloodRecordFrame stats={stats} />

                {/* 피의 기록 바로 아래 — 계정 설정 진입점 */}
                <button
                  type="button"
                  onClick={() => navigate("/account")}
                  className="relative block w-[clamp(7rem,13vw,10rem)] cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-85"
                >
                  <PublicAsset
                    src="/button/버튼 프레임1.png"
                    alt=""
                    className="block h-auto w-full select-none"
                  />
                  <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.75rem,1vw,0.9rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.85)]">
                    계정 관리
                  </span>
                </button>
              </>
            ) : null}
          </div>
        </div>
      </motion.main>

      {!loading && description ? <FateMaskFooter description={description} /> : null}
    </div>
  )
}
