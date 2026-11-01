// 뒤로 가기 버튼에 framer-motion 움직임을 입힌 것
// matching·setup·library·podium·settings·store 화면 컨트롤과 user 화면 틀, mode 방 코드 화면이 씀
import { motion } from "framer-motion"
import BackButton from "@/shared/ui/BackButton"

// 그릴 때마다 새로 만들지 않게 파일에서 한 번만 만듦
const MotionBackButton = motion.create(BackButton)

export default MotionBackButton
