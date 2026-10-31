import { useState } from "react"
import { LOGIN_ASSETS } from "@/domains/auth/constants/loginAssets.js"
import PublicAsset from "@/shared/ui/PublicAsset"

const inputIconClass = "h-[20px] w-[20px] shrink-0 text-neutral-600"

export const AUTH_DATE_INPUT_CLASS = "auth-date-input"

export function MailIcon() {
  return (
    <svg className={inputIconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  )
}

export function ProfileIcon() {
  return (
    <svg className={inputIconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" />
    </svg>
  )
}

export function CalendarIcon() {
  return (
    <svg className={inputIconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="4" y="5" width="16" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M4 10h16" />
    </svg>
  )
}

export function LockIcon() {
  return (
    <svg className={inputIconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

function EyeIcon() {
  return (
    <svg className={inputIconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  )
}

function EyeOffIcon() {
  return (
    <svg className={inputIconClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a2.5 2.5 0 0 0 3.5 3.5" />
      <path d="M6.4 6.4C4 8.1 2.5 10 2 12s3.5 6 10 6c1.8 0 3.4-.4 4.8-1.1" />
      <path d="M17.6 17.6C20 15.9 21.5 14 22 12s-3.5-6-10-6c-1.3 0-2.5.2-3.6.6" />
    </svg>
  )
}

export default function AuthInputSlot({
  type = "text",
  name,
  value,
  onChange,
  placeholder,
  autoComplete,
  leadingIcon,
  passwordToggle = false,
  compact = false,
  disabled = false,
  inputMode,
  inputTestId,
}) {
  const [passwordVisible, setPasswordVisible] = useState(false)

  const inputType = passwordToggle ? (passwordVisible ? "text" : "password") : type

  return (
    <div className={`relative w-full ${compact ? "origin-top -mb-0.5 scale-[0.97]" : ""}`}>
      <PublicAsset src={LOGIN_ASSETS.input} alt="" className="block h-auto w-full select-none" />

      <div className="absolute inset-0 flex items-center gap-2 px-[9%] py-2">
        {leadingIcon ? (
          <span className={`pointer-events-none flex items-center ${compact ? "scale-95" : ""}`}>{leadingIcon}</span>
        ) : null}

        <input
          type={inputType}
          name={name}
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          autoComplete={autoComplete}
          disabled={disabled}
          inputMode={inputMode}
          data-testid={inputTestId}
          className={`min-w-0 flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed disabled:opacity-60 ${
            type === "date"
              ? `${AUTH_DATE_INPUT_CLASS}${value ? " auth-date-input--filled" : ""}`
              : "text-white placeholder:text-white/55"
          }`.trim()}
        />

        {passwordToggle ? (
          <button
            type="button"
            onClick={() => setPasswordVisible((v) => !v)}
            className="group shrink-0 cursor-pointer border-0 bg-transparent p-0 text-neutral-600 transition-colors hover:text-neutral-800"
            aria-label={passwordVisible ? "비밀번호 숨기기" : "비밀번호 보기"}
          >
            <span className="interactive-scale-sm block">
              {passwordVisible ? <EyeOffIcon /> : <EyeIcon />}
            </span>
          </button>
        ) : null}
      </div>
    </div>
  )
}
