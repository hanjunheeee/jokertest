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

export default function LoginPage() {
  const [rememberMe, setRememberMe] = useState(false)
  const bgVideoRef = useRef(null)
  const audioRef = useRef(null)
  const [isSignupMode, setIsSignupMode] = useState(false)
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore(selectIsAuthenticated)
  const login = useAuthStore((state) => state.login)

  const [formData, setFormData] = useState({
    email: "",
    password: "",
    nickname: "",
  })

  useEffect(() => {
    if (!isAuthenticated) return;
    getMeApi()
      .then(() => navigate("/lobby", { replace: true }))
      .catch(() => {});
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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

  const handleInputChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    try {
      if (isSignupMode) {
        await signupApi(formData)
        alert("회원가입이 완료되었습니다! 로그인해주세요.")
        setIsSignupMode(false)
      } else {
        const { user } = await loginApi(formData)
        login(user)
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
              {isSignupMode ? (
                <SignupForm
                  formData={formData}
                  onChange={handleInputChange}
                  onSwitchToLogin={() => setIsSignupMode(false)}
                />
              ) : (
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
                        className="shrink-0 cursor-pointer text-[13px] text-amber-900 underline-offset-2 hover:underline"
                      >
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
                        className="cursor-pointer font-bold text-amber-800 underline-offset-2 hover:underline"
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
