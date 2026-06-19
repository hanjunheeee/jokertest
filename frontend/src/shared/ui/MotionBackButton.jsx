/**
 * framer-motion 애니메이션을 받을 수 있는 뒤로가기 버튼.
 *
 * BackButton 파일은 순수 컴포넌트만 export하도록 유지하고, motion 래퍼는 별도 파일에서 제공합니다.
 */
import { motion } from "framer-motion"
import BackButton from "@/shared/ui/BackButton.jsx"

const MotionBackButton = motion.create(BackButton)

export default MotionBackButton
