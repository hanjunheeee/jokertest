// 로그인 액자 그림을 9칸으로 잘라 내용 높이만큼 늘어나는 양피지 카드
// scene/RecoveryScene.jsx가 씀
import { publicAsset } from "@/shared/utils/publicAsset.js"
import { LOGIN_ASSETS } from "@/shared/constants/loginAssets.js"

// 그림(403×625) 자르는 선: 위는 가면 장식 아래, 좌우는 테두리 무늬, 아래는 바닥 무늬
// 테두리 두께를 카드 폭 비율(cqw)로 줘서 장식이 가로세로 같은 배율로 커짐 (가면 안 찌그러짐)
const FRAME_BORDER = "29.3cqw 10.9cqw 13.9cqw 10.9cqw"

const FRAME_STYLE = {
  borderStyle: "solid",
  borderWidth: FRAME_BORDER,
  borderImageSource: `url("${publicAsset(LOGIN_ASSETS.frame)}")`,
  borderImageSlice: "118 44 56 44 fill",
  borderImageWidth: FRAME_BORDER,
  borderImageRepeat: "stretch",
}

// 바깥 div가 폭 기준(container), 안쪽이 액자
// 세로 화면은 데스크톱 액자 비율(403:625)을 최소 높이로 씀, 내용이 길면 더 길어짐 / 가로 화면은 내용만큼
export default function ParchmentCard({ children, className = "" }) {
  return (
    <div className={`w-full [container-type:inline-size] ${className}`}>
      <div style={FRAME_STYLE} className="flex aspect-[403/625] flex-col land:aspect-auto">
        {children}
      </div>
    </div>
  )
}
