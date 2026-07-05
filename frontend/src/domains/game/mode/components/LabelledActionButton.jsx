/**
 * 이미지 위에 텍스트 라벨을 겹쳐 그리는 액션 버튼.
 *
 * RoomInvitePage에서 "취소"·"참여하기" 버튼에 사용됩니다.
 * motion.button을 사용하므로 variants를 받아 부모 motion.div의 stagger 애니메이션에 참여합니다.
 *
 * props
 * - src: 버튼 배경 이미지 경로
 * - label: 텍스트 라벨 (aria-label과 화면 표시 겸용)
 * - onClick: 클릭 핸들러
 * - variants: 부모 motion 컨테이너에서 전달받는 animation variant
 * - className: 추가 클래스
 */
import { motion } from "framer-motion"
import PublicAsset from "@/shared/ui/PublicAsset"
import {
  ROOM_CODE_ACTION_BTN_CLASS,
  ROOM_CODE_ACTION_BTN_LABEL_CLASS,
} from "../constants/roomCodeFrameStyles.js"

export default function LabelledActionButton({
  src, // 버튼 배경 이미지 경로
  label, // 텍스트 라벨 (aria-label과 화면 표시 겸용)
  onClick, // 클릭 핸들러
  className = "", // 추가 클래스
  variants, // 부모 motion 컨테이너에서 전달받는 animation variant
}) {
  return (
    <motion.button
      type="button"
      aria-label={label}
      onClick={onClick}
      variants={variants} // 부모 BUTTON_ROW_VARIANTS의 staggerChildren에 따라 순차 등장
      className={`${ROOM_CODE_ACTION_BTN_CLASS} ${className}`}
    >
      <PublicAsset src={src} alt="" className="block h-auto w-full select-none" />
      {/* aria-hidden: aria-label이 이미 접근성 레이블을 담당하므로 스크린리더 중복 방지 */}
      <span className={ROOM_CODE_ACTION_BTN_LABEL_CLASS} aria-hidden="true">
        {label}
      </span>
    </motion.button>
  )
}
