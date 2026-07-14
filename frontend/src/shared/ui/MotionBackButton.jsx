import { motion } from "framer-motion"
import BackButton from "@/shared/ui/BackButton"

// BackButton의 애니메이션 가능 버전입니다.
// 버튼의 생김새는 BackButton 그대로 쓰고, 움직임만 framer-motion이 제어할 수 있게 합니다.
// BackButton을 framer-motion이 제어할 수 있는 컴포넌트로 감쌉니다.
// 이렇게 하면 BackButton 자체는 애니메이션을 몰라도 되고, 사용하는 쪽에서 initial/animate/transition을 넘길 수 있습니다.
const MotionBackButton = motion.create(BackButton)

export default MotionBackButton
