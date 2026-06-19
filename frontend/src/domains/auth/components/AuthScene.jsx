/**
 * 인증 화면의 공통 무대.
 *
 * 배경 영상, BGM, 연령 등급, 사운드 컨트롤, 중앙 프레임은 로그인/회원가입이
 * 공유하는 시각 구조입니다. 페이지는 children으로 폼만 주입합니다.
 */
import { useRef } from "react"
import { LOGIN_ASSETS } from "@/domains/auth/constants/loginAssets.js"
import { BGM_ASSETS } from "@/shared/constants/bgmAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import SoundControl from "@/shared/ui/SoundControl.jsx"
import { publicAsset } from "@/shared/utils/publicAsset.js"
import { useLoginBgm } from "../hooks/useLoginBgm.js"

/** 인증 폼을 중앙 프레임 안에 배치하는 배경/프레임 레이아웃 */
export default function AuthScene({ children, onSubmit }) {
  const audioRef = useRef(null)

  useLoginBgm(audioRef)

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <audio ref={audioRef} src={publicAsset(BGM_ASSETS.loginMusic)} loop />
      <video
        src={publicAsset(LOGIN_ASSETS.bgVideo)}
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover object-center"
      />

      <PublicAsset
        src={LOGIN_ASSETS.ageRating}
        alt="전체이용가"
        className="pointer-events-none absolute left-4 top-4 z-10 h-auto w-[4.5rem] select-none sm:left-6 sm:top-6 sm:w-20"
      />

      <div className="absolute bottom-4 right-4 z-10 sm:bottom-6 sm:right-6">
        <SoundControl audioRef={audioRef} />
      </div>

      <div className="absolute inset-0 flex items-center justify-center px-4 py-6">
        <div className="relative w-full max-w-[min(26rem,94vw)]">
          <PublicAsset
            src={LOGIN_ASSETS.frame}
            alt=""
            className="pointer-events-none block h-auto w-full select-none"
          />

          <div
            className="absolute inset-0 flex flex-col"
            style={{
              paddingTop: "22%",
              paddingBottom: "9%",
              paddingLeft: "13%",
              paddingRight: "13%",
            }}
          >
            <form onSubmit={onSubmit} className="flex flex-1 flex-col">
              {children}
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
