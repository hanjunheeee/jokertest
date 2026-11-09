// 관리자 로그인 화면 파일, 아이디·비밀번호·OTP 6자리 세 칸을 한 번에 보냄 (문 2)
// AdminApp이 /login에 붙임, 성공하면 AdminApp이 원래 주소로 보냄
import { useRef, useState } from 'react'
import Field from '@/admin/shared/ui/Field'
import { adminErrorText } from '@/admin/shared/api/errorText'

const OTP_LENGTH = 6

// 숫자만 남기고 6자리까지 (예: '12a3' → '123', 붙여넣은 '123 456' → '123456')
const onlyOtpDigits = (text) => text.replace(/\D/g, '').slice(0, OTP_LENGTH)

// notice: 자동 로그아웃으로 왔을 때 까닭 코드 (예: 'ADMIN_SESSION_EXPIRED')
export default function LoginPage({ onLogin, notice }) {
  const [loginId, setLoginId] = useState('')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const otpRef = useRef(null)

  const ready = loginId.trim() !== '' && password !== '' && otp.length === OTP_LENGTH && !busy

  const submit = async (event) => {
    event.preventDefault()
    if (!ready) return
    setBusy(true)
    setError(null)
    try {
      await onLogin({ loginId: loginId.trim(), password, otp })
    } catch (caught) {
      // OTP 번호는 한 번 쓰면 못 씀 → 비우고 그 칸으로
      setError(caught)
      setOtp('')
      otpRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-start justify-center bg-page px-4 py-12 text-ink sm:items-center">
      <form onSubmit={submit} noValidate className="flex w-full max-w-sm flex-col gap-4 rounded border border-line bg-panel p-6">
        <div>
          <h1 className="text-xl font-bold">관리자 로그인</h1>
          <p className="mt-1 text-sm text-muted">가면무도회 살인사건 운영 화면</p>
        </div>
        {notice === 'ADMIN_SESSION_EXPIRED' ? (
          <p role="status" className="rounded border border-line bg-page px-3 py-2 text-sm">{adminErrorText(notice)}</p>
        ) : null}
        <Field label="아이디" name="loginId" autoComplete="username" autoCapitalize="none" spellCheck={false}
          value={loginId} onChange={(event) => setLoginId(event.target.value)} />
        <Field label="비밀번호" name="password" type="password" autoComplete="current-password"
          value={password} onChange={(event) => setPassword(event.target.value)} />
        <Field label="OTP 번호 6자리" name="otp" ref={otpRef} inputMode="numeric" autoComplete="one-time-code"
          hint="OTP 앱에 보이는 숫자 6자리" value={otp} onChange={(event) => setOtp(onlyOtpDigits(event.target.value))} />
        {error ? <p role="alert" className="text-sm text-danger">{adminErrorText(error)}</p> : null}
        <button type="submit" disabled={!ready}
          className="min-h-11 rounded bg-accent px-4 font-semibold text-accent-ink disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? '로그인 중…' : '로그인'}
        </button>
      </form>
    </main>
  )
}
