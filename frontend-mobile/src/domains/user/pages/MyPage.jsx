// 마이페이지 화면 (/mypage: 프로필 띠 · 운명의 가면 · 피의 기록 + 바닥 메뉴 4개)
// app/routes/index.jsx가 씀, 값은 데스크톱 useMyProfile 그대로

import { motion } from "framer-motion"
import { useNavigate } from "react-router-dom"
import ScreenFrame from "@m/domains/user/components/mypage/ScreenFrame.jsx"
import ProfileCard from "@m/domains/user/components/mypage/ProfileCard.jsx"
import FateMask from "@m/domains/user/components/mypage/FateMask.jsx"
import BloodRecord from "@m/domains/user/components/mypage/BloodRecord.jsx"
import StaleNotice from "@m/domains/user/components/mypage/StaleNotice.jsx"
import MyPageActions from "@m/domains/user/components/mypage/MyPageActions.jsx"
import ProfileEditSheet from "@m/domains/user/components/profileEdit/ProfileEditSheet.jsx"
import WearSheet from "@m/domains/user/components/wear/WearSheet.jsx"
import { MY_PAGE_SHEETS, useMyPageSheet } from "@m/domains/user/hooks/mypage/useMyPageSheet.js"
import ShellBottom from "@m/shared/ui/ShellBottom.jsx"
import { MY_PAGE_UI_FADE } from "@/domains/user/constants/myPageLayoutStyle.js"
import { useMyProfile } from "@/shared/hooks/useMyProfile.js"

// 뒤로는 로비로 (데스크톱과 같음), 불러오는 중엔 데스크톱처럼 빈 화면
export default function MyPage() {
    const navigate = useNavigate()
    const { profile, stats, description, loading, isStale, error, retry } = useMyProfile()
    const { openSheet, sheetProps } = useMyPageSheet()

    const ready = !loading && profile
    const showNotice = isStale || (!loading && !profile)

    // 프로필 수정·스킨&카드 착용 시트는 주소 ?sheet=로 열고 닫음 (폰 뒤로 가기로 닫히게)
    return (
        <ScreenFrame title="마이페이지" onBack={() => navigate("/lobby")}>
            <div className="mx-auto flex w-full max-w-[26rem] flex-col gap-3 px-4 pb-4 md:max-w-[30rem] land:max-w-[52rem] lg:max-w-[52rem]">
                {showNotice ? <StaleNotice hasProfile={Boolean(profile)} error={error} onRetry={retry} /> : null}

                {ready ? (
                    // 세로: 띠 → 가면 → 기록 (데스크톱 순서), 가로·lg: 왼쪽 띠·기록 / 오른쪽 가면 (lg 세로 한 줄이면 기록이 바닥 메뉴에 가림)
                    <div className="flex flex-col gap-3 land:grid land:grid-cols-2 land:items-start land:gap-x-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-x-6">
                        <div className="land:col-start-1 land:row-start-1 lg:col-start-1 lg:row-start-1">
                            <ProfileCard profile={profile} />
                        </div>
                        {/* 가면·기록은 데스크톱 본문처럼 서서히 나타남 (띠는 바로) */}
                        {description ? (
                            <motion.div
                                className="land:col-start-2 land:row-span-2 land:row-start-1 lg:col-start-2 lg:row-span-2 lg:row-start-1"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={MY_PAGE_UI_FADE}
                            >
                                <FateMask description={description} />
                            </motion.div>
                        ) : null}
                        <motion.div
                            className="land:col-start-1 land:row-start-2 lg:col-start-1 lg:row-start-2"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={MY_PAGE_UI_FADE}
                        >
                            <BloodRecord stats={stats} />
                        </motion.div>
                    </div>
                ) : null}
            </div>

            <ShellBottom>
                <MyPageActions
                    onAccount={() => navigate("/account")}
                    onProfileEdit={() => openSheet(MY_PAGE_SHEETS.profileEdit)}
                    onSkinCardWear={() => openSheet(MY_PAGE_SHEETS.skinCardWear)}
                    onEmoticons={() => navigate("/mypage/emoticons")}
                />
            </ShellBottom>

            <ProfileEditSheet {...sheetProps(MY_PAGE_SHEETS.profileEdit)} />
            <WearSheet {...sheetProps(MY_PAGE_SHEETS.skinCardWear)} />
        </ScreenFrame>
    )
}
