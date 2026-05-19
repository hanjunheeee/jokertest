import { useRef, useState } from "react"
import { LOGIN_ASSETS } from "../assets/loginAssets.js"
import PublicAsset from "../components/login/PublicAsset.jsx"
import SoundControl from "../components/login/SoundControl.jsx"
import { publicAsset } from "../lib/publicAsset.js"

const inputIconClass = "h-[20px] w-[20px] shrink-0 text-neutral-600"

function MailIcon() {
  return (
    <svg
      className={inputIconClass}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  )
}

function LockIcon() {
  return (
    <svg
      className={inputIconClass}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg
      className={inputIconClass}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg
      className={inputIconClass}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5" />
      <path d="M6.4 6.4C4 8.1 2.5 10 2 12s3.5 6 10 6c1.8 0 3.4-.4 4.8-1.1" />
      <path d="M17.6 17.6C20 15.9 21.5 14 22 12s-3.5-6-10-6c-1.3 0-2.5.2-3.6.6" />
    </svg>
  )
}

function InputSlot({
  type = "text",
  placeholder,
  autoComplete,
  leadingIcon,
  passwordToggle = false,
}) {
  const [passwordVisible, setPasswordVisible] = useState(false)
  const inputType = passwordToggle
    ? passwordVisible
      ? "text" 
      : "password"
    : type

  return (
    <div className="relative w-full">
      <PublicAsset
        src={LOGIN_ASSETS.input}
        alt=""
        className="block h-auto w-full select-none"
      />
      <div className="absolute inset-0 flex items-center gap-2 px-[9%] py-2">
        <span className="pointer-events-none flex items-center">{leadingIcon}</span>
        <input
          type={inputType}
          placeholder={placeholder}
          autoComplete={autoComplete}
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/55"
        />
        {passwordToggle ? (
          <button
            type="button"
            onClick={() => setPasswordVisible((v) => !v)}
            className="shrink-0 cursor-pointer border-0 bg-transparent p-0 text-neutral-600 transition-colors hover:text-neutral-800"
            aria-label={
              passwordVisible ? "\uBE44\uBC00\uBC88\uD638 \uC228\uAE30\uAE30" : "\uBE44\uBC00\uBC88\uD638 \uBCF4\uAE30"
            }
          >
            {passwordVisible ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function RememberMeCheckbox({ checked, onChange }) {
  const toggle = () => onChange(!checked)

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={toggle}
      className="flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0"
    >
      <span
        className={`relative flex h-4 w-4 shrink-0 items-center justify-center transition-opacity ${
          checked ? "opacity-100" : "opacity-70"
        }`}
      >
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
      <span className="text-[13px] text-text-body">{"\uB85C\uADF8\uC778 \uC0C1\uD0DC \uC720\uC9C0"}</span>
    </button>
  )
}

function ImageButton({ src, label, className = "" }) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`block w-full border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-90 ${className}`}
    >
      <PublicAsset src={src} alt="" className="block h-auto w-full select-none" />
    </button>
  )
}

export default function LoginPage() {
  const [rememberMe, setRememberMe] = useState(false)
  const bgVideoRef = useRef(null)

  return (
    <div className="relative h-svh w-full overflow-hidden bg-black">
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
        <SoundControl videoRef={bgVideoRef} />
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
            <header className="text-center">
              <p className="text-[13px] leading-relaxed text-text-body/90 mt-[40px] mb-[-10px]">
                계정을 로그인 하여 모험을 계속하세요
              </p>
            </header>

            <div className="mt-4 flex flex-1 flex-col gap-2">
              <InputSlot
                type="email"
                leadingIcon={<MailIcon />}
                placeholder={"\uC774\uBA54\uC77C\uC744 \uC785\uB825\uD558\uC138\uC694"}
                autoComplete="email"
              />
              <InputSlot
                leadingIcon={<LockIcon />}
                passwordToggle
                placeholder={"\uBE44\uBC00\uBC88\uD638\uB97C \uC785\uB825\uD558\uC138\uC694"}
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
                  {"\uBE44\uBC00\uBC88\uD638 \uCC3E\uAE30"}
                </button>
              </div>

              <ImageButton
                src={LOGIN_ASSETS.loginButton}
                label="???"
                className="mt-1 cursor-pointer"
              />

              <p className="text-center text-[11px] leading-none text-text-body/80">
                {"\uB610\uB294"}
              </p>

              <div className="flex flex-col gap-2">
                <ImageButton
                  src={LOGIN_ASSETS.google}
                  className="mt-[3px] cursor-pointer"
                  label="Google? ???"
                />
                <ImageButton
                  src={LOGIN_ASSETS.apple}
                  className="cursor-pointer"
                  label="Apple? ???"
                />
                <ImageButton
                  src={LOGIN_ASSETS.discord}
                  className="cursor-pointer"
                  label="Discord? ???"
                />
              </div>

              <p className="mt-2 text-center text-[13px] text-text-body">
                계정이 없으신가요?{" "}
                <button
                  type="button"
                  className="cursor-pointer font-bold text-amber-800 underline-offset-2 hover:underline"
                >
                  회원가입
                </button>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
