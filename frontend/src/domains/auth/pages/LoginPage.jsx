/**
 * 로그인·회원가입 화면 (prototype: 로그인 프레임)
 * 미인증 사용자 진입점 — ProtectedRoute에서 /login으로 리다이렉트
 *
 * - 로그인 성공 → authStore.login 후 /lobby
 * - 이미 인증됨 → getMeApi 확인 후 /lobby (replace)
 * - 회원가입 모드 → SignupForm, signupApi 후 로그인 폼으로 전환
 *
 * 미구현 (TODO): 로그인 상태 유지(rememberMe), 비밀번호 찾기, Google·Apple·Discord 소셜 로그인
 *
 * UI 구성: 배경 영상·로그인 BGM, 연령 등급, SoundControl, 양피지 프레임·입력·이미지 버튼
 * 에셋은 constants/loginAssets.js 참고
 */
import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { loginApi, signupApi, getMeApi } from "../api/auth"
import { LOGIN_ASSETS } from "../constants/loginAssets.js"
import AuthImageButton from "@/domains/auth/components/AuthImageButton.jsx"
import AuthInputSlot, { LockIcon, MailIcon } from "@/domains/auth/components/AuthInputSlot.jsx"
import SignupForm from "@/domains/auth/components/SignupForm.jsx"
import { BGM_ASSETS } from "@/shared/constants/bgmAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"
import SoundControl from "@/shared/ui/SoundControl.jsx"
import { publicAsset } from "@/shared/utils/publicAsset.js"

import {
  selectIsAuthenticated,
  useAuthStore,
} from "@/domains/auth/store/authStore"

/** 로그인 폼 "로그인 상태 유지" 체크박스 (UI만, API·저장 연동 없음) */
function RememberMeCheckbox({ checked, onChange }) {
  const toggle = () => onChange(!checked)

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={toggle}
      className="group flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0"
    >
      <span className="interactive-scale-sm relative flex h-4 w-4 shrink-0 items-center justify-center">
        <PublicAsset
          src={LOGIN_ASSETS.checkbox}
          alt=""
          className="pointer-events-none h-4 w-4 select-none"
        />
        {checked ? (
          <span
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-white"
            aria-hidden="true"
          >
            <svg
              className="h-3 w-3"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 13l4 4L19 7" />
            </svg>
          </span>
        ) : null}
      </span>
      <span className="text-[13px] text-text-body">로그인 상태 유지</span>
    </button>
  )
}

/** 로그인·회원가입 폼·BGM·인증 리다이렉트를 묶는 인증 페이지 */
export default function LoginPage() {
  const [rememberMe, setRememberMe] = useState(false) // 미구현 (TODO: 토큰·세션 유지 연동)
  const bgVideoRef = useRef(null)
  const audioRef = useRef(null) // 로그인 BGM — SoundControl과 공유
  const [isSignupMode, setIsSignupMode] = useState(false) // true면 SignupForm 표시
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  const login = useAuthStore((state) => state.login)

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    nickname: "", // 회원가입 시에만 사용
  })

  // 마운트 시 이미 로그인된 세션이면 /lobby로 보냄
  useEffect(() => {
    if (!isAuthenticated) return;
    getMeApi()
      .then(() => navigate("/lobby", { replace: true }))
      .catch(() => {});
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // BGM 자동 재생 시도 — 브라우저 정책으로 막히면 첫 클릭 때 재생
  useEffect(() => {
    const playBgm = () => {
      if (audioRef.current) {
        audioRef.current.play().catch(() => {
          console.log("유저 상호작용(클릭 등) 전이라 자동 재생이 차단되었습니다. 버튼이나 클릭으로 켜야 합니다.")
        })
      }
    }

    playBgm()
    window.addEventListener("click", playBgm, { once: true })

    return () => window.removeEventListener("click", playBgm)
  }, [])

  /** email·password·nickname 필드를 formData에 반영 */
  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  /** 제출 시 회원가입·로그인 API 분기 후 성공 시 로비 이동 또는 가입 완료 안내 */
  const handleSubmit = async (e) => {
    e.preventDefault()

    try {
      if (isSignupMode) {
        await signupApi(formData)
        alert("회원가입이 완료되었습니다! 로그인해주세요.")
        setIsSignupMode(false) // 가입 후 로그인 폼으로
      } else {
        const { user } = await loginApi(formData)
        login(user) // authStore에 사용자 저장
        navigate("/lobby")
      }
    } catch (error) {
      console.error("API 통신 에러:", error)
      alert(error.message || "서버와 연결할 수 없습니다.")
    }
  }

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
      <audio
        ref={audioRef}
        src={publicAsset(BGM_ASSETS.loginMusic)}
        loop
      />
      <video
        ref={bgVideoRef}
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
            <form onSubmit={handleSubmit} className="flex flex-1 flex-col">
              {isSignupMode ? ( // 회원가입 폼
                <SignupForm
                  formData={formData}
                  onChange={handleInputChange}
                  onSwitchToLogin={() => setIsSignupMode(false)}
                />
              ) : ( // 로그인 폼
                <>
                  <header className="text-center">
                    <p className="mt-[40px] mb-[-10px] text-[13px] leading-relaxed text-text-body/90">
                      계정을 로그인 하여 모험을 계속하세요
                    </p>
                  </header>

                  <div className="mt-4 flex flex-1 flex-col gap-2">
                    <AuthInputSlot
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      leadingIcon={<MailIcon />}
                      placeholder="이메일을 입력하세요"
                      autoComplete="email"
                    />

                    <AuthInputSlot
                      name="password"
                      value={formData.password}
                      onChange={handleInputChange}
                      leadingIcon={<LockIcon />}
                      passwordToggle
                      placeholder="비밀번호를 입력하세요"
                      autoComplete="current-password"
                    />

                    <div className="relative z-10 mt-0.5 flex items-center justify-between gap-2">
                      <RememberMeCheckbox
                        checked={rememberMe}
                        onChange={setRememberMe}
                      />
                      <button
                        type="button"
                        className="auth-text-link shrink-0"
                      >
                        {/* 미구현 (TODO: 비밀번호 찾기) */}
                        비밀번호 찾기
                      </button>
                    </div>

                    <AuthImageButton
                      type="submit"
                      src={LOGIN_ASSETS.loginButton}
                      label="로그인"
                      className="mt-1 cursor-pointer"
                    />

                    <p className="text-center text-[11px] leading-none text-text-body/80">
                      또는
                    </p>
                    <div className="flex flex-col gap-2">
                      {/* 미구현 (TODO: OAuth 연동) */}
                      <AuthImageButton
                        src={LOGIN_ASSETS.google}
                        className="mt-[3px] cursor-pointer"
                        label="Google 로그인"
                      />
                      <AuthImageButton
                        src={LOGIN_ASSETS.apple}
                        className="cursor-pointer"
                        label="Apple 로그인"
                      />
                      <AuthImageButton
                        src={LOGIN_ASSETS.discord}
                        className="cursor-pointer"
                        label="Discord 로그인"
                      />
                    </div>

                    <p className="mt-2 text-center text-[13px] text-text-body">
                      계정이 없으신가요?{" "}
                      <button
                        type="button"
                        onClick={() => setIsSignupMode(true)}
                        className="auth-text-link"
                      >
                        회원가입
                      </button>
                    </p>
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
