/**
 * framer-motion 애니메이션을 받을 수 있는 뒤로가기 버튼.
 *
 * BackButton 파일은 순수 컴포넌트만 export하도록 유지하고, motion 래퍼는 별도 파일에서 제공합니다.
 */
import { motion } from "framer-motion"
import BackButton from "@/shared/ui/BackButton.jsx"

// motion.create(컴포넌트)는 일반 컴포넌트를 감싸서 animate/initial/exit 같은
// framer-motion 애니메이션 props를 받을 수 있는 새 컴포넌트로 만들어 줍니다.
// 즉 BackButton과 똑같이 동작하면서 애니메이션만 추가로 사용할 수 있습니다.
const MotionBackButton = motion.create(BackButton)

export default MotionBackButton
