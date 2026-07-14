import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import FateMaskFooter from "@/domains/user/components/FateMaskFooter.jsx"
import MyPageProfileFrame from "@/domains/user/components/MyPageLayout/MyPageProfileFrame.jsx"
import MyPageSummaryPanel from "@/domains/user/components/MyPageLayout/MyPageSummaryPanel.jsx"
import {
  MY_PAGE_CONTENT_ROW_CLASS,
  MY_PAGE_MAIN_CLASS,
  MY_PAGE_ROOT_CLASS,
  MY_PAGE_UI_FADE,
} from "@/domains/user/constants/myPageLayoutStyle.js"
import { useMyProfile } from "@/domains/user/hooks/useMyProfile.js"

// 마이페이지의 전체 화면 구성을 담당합니다.
// 프로필 조회는 여기서 하고, 실제 화면 조각은 하위 컴포넌트에 맡깁니다.
export default function MyPageLayout() {
  const navigate = useNavigate()
  const { profile, stats, description, loading } = useMyProfile()

  return (
    <div className={MY_PAGE_ROOT_CLASS}>
      <motion.main
        className={MY_PAGE_MAIN_CLASS}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={MY_PAGE_UI_FADE}
      >
        <div className={MY_PAGE_CONTENT_ROW_CLASS}>
          {/* 왼쪽 프로필 이미지 영역입니다. */}
          <MyPageProfileFrame />

          {/* 프로필 데이터 로딩이 끝난 뒤 오른쪽 요약 영역을 보여줍니다. */}
          {!loading && profile ? (
            <MyPageSummaryPanel
              profile={profile}
              stats={stats}
              onAccountClick={() => navigate("/account")}
            />
          ) : null}
        </div>
      </motion.main>

      {/* 하단 운명의 가면 설명은 설명 데이터가 준비된 뒤 보여줍니다. */}
      {!loading && description ? <FateMaskFooter description={description} /> : null}
    </div>
  )
}
