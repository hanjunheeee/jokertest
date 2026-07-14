import { LOGIN_ASSETS } from "@/domains/auth/constants/loginAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

// 중앙 프레임 이미지와 그 안에 들어가는 실제 form 영역을 담당합니다.
export default function AuthFrame({ children, onSubmit }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center px-4 py-6">
      <div className="relative w-full max-w-[min(26rem,94vw)]">
        {/* 폼 뒤에 깔리는 프레임 이미지입니다. */}
        <PublicAsset src={LOGIN_ASSETS.frame} alt="" className="pointer-events-none block h-auto w-full select-none" />

        {/* 프레임 이미지 안쪽 여백에 맞춰 실제 폼 영역을 겹쳐 올립니다. */}
        <div
          className="absolute inset-0 flex flex-col"
          style={{ paddingTop: "22%", paddingBottom: "9%", paddingLeft: "13%", paddingRight: "13%" }}
        >
          {/* children에는 로그인 폼이나 회원가입 폼의 실제 입력 요소들이 들어옵니다. */}
          <form onSubmit={onSubmit} className="flex flex-1 flex-col">
            {children}
          </form>
        </div>
      </div>
    </div>
  )
}
