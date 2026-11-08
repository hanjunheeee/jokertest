// 회원 탈퇴 폼 (본인 확인 입력 → 되돌릴 수 없다는 확인 창 → 보내기 → 로그인 화면으로)
// 데스크톱·모바일 탈퇴 칸이 씀, 비번 있는 계정은 비번, 소셜 전용은 계정 이메일 다시 쓰기
import { useRef, useState } from "react"
import { withdrawApi } from "../../api/member.api.js"
import { forceRelogin } from "../../../../shared/utils/forceRelogin.js"

// 탈퇴 오류 코드 → 문구 (서버 문구가 없을 때)
export const WITHDRAW_ERROR_TEXT = {
  WITHDRAW_IN_GAME: "진행 중인 게임이 끝난 뒤에 탈퇴할 수 있습니다.",
  WITHDRAW_PASSWORD_REQUIRED: "비밀번호를 입력해주세요.",
  WITHDRAW_PASSWORD_INVALID: "비밀번호가 올바르지 않습니다.",
  WITHDRAW_CONFIRM_MISMATCH: "계정 이메일을 정확히 입력해주세요.",
  WITHDRAW_LOCKED: "여러 번 잘못 입력했습니다. 잠시 후 다시 시도해주세요.",
}

// 확인 창에 보일 안내 (재화 사라짐·되돌릴 수 없음)
export const WITHDRAW_NOTICE_LINES = [
  "탈퇴하면 되돌릴 수 없습니다.",
  "가진 골드·다이아·아이템은 모두 사라지고 환불되지 않습니다.",
  "친구·초대 목록은 지워지고, 전적은 이름 없이 남습니다.",
  "같은 이메일로 다시 가입할 수 있지만 새 계정이 됩니다.",
]

export function useWithdrawForm({ account, withdraw = withdrawApi, onWithdrawn = () => forceRelogin() } = {}) {
  const [secret, setSecret] = useState("")
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [msg, setMsg] = useState(null)
  const submittingRef = useRef(false)
  const usesPassword = account?.hasLocalPassword !== false

  // 확인 창 열기 전 빈칸 검사
  const openConfirm = (event) => {
    event?.preventDefault?.()
    if (!account) return
    if (!secret.trim()) {
      setMsg({ type: "error", text: usesPassword ? "비밀번호를 입력해주세요." : "계정 이메일을 입력해주세요." })
      return
    }
    setMsg(null)
    setConfirmOpen(true)
  }

  // 확인 창에서 "탈퇴" → 보내기, 성공하면 안내 뒤 로그인 화면으로
  const confirmWithdraw = async () => {
    if (submittingRef.current) return
    submittingRef.current = true
    setLoading(true)
    try {
      await withdraw(usesPassword ? { password: secret } : { confirmEmail: secret })
      setConfirmOpen(false)
      setMsg({ type: "success", text: "회원 탈퇴가 완료되었습니다." })
      onWithdrawn()
    } catch (err) {
      setConfirmOpen(false)
      setMsg({ type: "error", text: err?.message || WITHDRAW_ERROR_TEXT[err?.code] || "탈퇴하지 못했습니다. 다시 시도해주세요." })
    } finally {
      submittingRef.current = false
      setLoading(false)
    }
  }

  return {
    secret,
    setSecret,
    usesPassword,
    confirmOpen,
    openConfirm,
    closeConfirm: () => setConfirmOpen(false),
    confirmWithdraw,
    loading,
    msg,
  }
}
