/**
 * 계정 관리 패널.
 *
 * 닉네임 변경 · 비밀번호 변경 두 섹션을 수직으로 배열합니다.
 * 입력 스타일은 AuthInputSlot을 재사용해 게임 전체 인증 UI와 일관성을 유지합니다.
 */
import { motion } from "framer-motion"
import AuthInputSlot, { LockIcon } from "@/domains/auth/components/AuthInputSlot.jsx"
import PublicAsset from "@/shared/ui/PublicAsset"
import { useAccountForm } from "../hooks/useAccountForm.js"
import { UI_REVEAL_TRANSITION } from "@/shared/constants/pageTransitions.js"

const CONFIRM_BTN_SRC = "/button/버튼(수락 및 긍정).png"

const PANEL_HEADING_CLASS =
  "font-subheading text-[clamp(1rem,1.4vw,1.15rem)] font-bold text-[#e8dfc8] [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]"

const SECTION_CLASS =
  "flex flex-col gap-[clamp(0.55rem,1.1vh,0.75rem)] border-b border-[#8b6a3e]/30 pb-[clamp(1rem,2.2vh,1.5rem)]"

/** 닉네임/비밀번호 변경 후 표시하는 인라인 피드백 메시지 */
function FeedbackMsg({ msg }) {
  if (!msg) return null
  const color = msg.type === "success" ? "text-[#a8d48a]" : "text-[#e87a7a]"
  return (
    <p className={`font-subheading text-[0.82rem] font-bold ${color} [text-shadow:0_1px_2px_rgba(0,0,0,0.7)]`}>
      {msg.text}
    </p>
  )
}

/** 게임 스타일 확인 버튼 (버튼 PNG 위에 텍스트 오버레이) */
function ConfirmButton({ label, disabled }) {
  return (
    <button
      type="submit"
      disabled={disabled}
      className="relative block w-[clamp(7rem,13vw,10rem)] cursor-pointer border-0 bg-transparent p-0 leading-none transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-40"
    >
      <PublicAsset src={CONFIRM_BTN_SRC} alt="" className="block h-auto w-full select-none" />
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-subheading text-[clamp(0.8rem,1.1vw,0.95rem)] font-bold text-[#f5f0e6] [text-shadow:0_1px_3px_rgba(0,0,0,0.8)]">
        {label}
      </span>
    </button>
  )
}

/** 입력창 좌측 — 닉네임 필드 사람 아이콘 */
function UserIcon() {
  return (
    <svg
      className="h-[20px] w-[20px] shrink-0 text-neutral-600"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="8" r="4" />
      <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
    </svg>
  )
}

/** 닉네임/비밀번호 변경 폼 두 섹션을 렌더링하고, 상태·제출 로직은 useAccountForm에 위임 */
export default function AccountPanel() {
  // useAccountForm이 폼 상태와 제출 핸들러를 모두 캡슐화해서 돌려줌.
  // nickname/setNickname: 닉네임 입력값과 그 값을 바꾸는 함수
  // nicknameMsg: 닉네임 변경 성공/실패 메시지, nicknameLoading: 닉네임 API 요청 중 여부
  // handleNicknameSubmit: 닉네임 변경 폼 제출 핸들러
  // pwForm: { currentPassword, newPassword } 객체, handlePwChange: 비밀번호 입력 변경 핸들러
  // pwMsg/pwLoading: 비밀번호 변경 메시지·로딩 상태, handlePasswordSubmit: 비밀번호 변경 폼 제출 핸들러
  const {
    nickname, setNickname, nicknameMsg, nicknameLoading, handleNicknameSubmit,
    pwForm, handlePwChange, pwMsg, pwLoading, handlePasswordSubmit,
  } = useAccountForm()

  return (
    <motion.div
      className="absolute left-1/2 top-1/2 z-10 w-[min(36rem,90vw)] -translate-x-1/2 -translate-y-1/2"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={UI_REVEAL_TRANSITION}
    >
      {/* 패널 배경 — 게임 세계관과 어울리는 어두운 양피지 계열 */}
      <div className="rounded-sm bg-[#160d08]/88 px-[clamp(1.5rem,4vw,2.5rem)] py-[clamp(1.25rem,3vh,2rem)] shadow-[0_4px_32px_rgba(0,0,0,0.7)] ring-1 ring-[#8b6a3e]/35 backdrop-blur-sm">

        <h2 className="mb-[clamp(1rem,2.5vh,1.5rem)] font-subheading text-[clamp(1.1rem,1.6vw,1.3rem)] font-bold text-[#e8dfc8] [text-shadow:0_2px_4px_rgba(0,0,0,0.9)]">
          계정 관리
        </h2>

        <div className="flex flex-col gap-[clamp(1rem,2.5vh,1.5rem)]">

          {/* ── 닉네임 변경 ── */}
          <section className={SECTION_CLASS}>
            <h3 className={PANEL_HEADING_CLASS}>닉네임 변경</h3>
            <form onSubmit={handleNicknameSubmit} className="flex flex-col gap-[clamp(0.5rem,1vh,0.65rem)]">
              <AuthInputSlot
                name="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="새 닉네임"
                autoComplete="off"
                leadingIcon={<UserIcon />}
              />
              <div className="flex items-center justify-between gap-3">
                <FeedbackMsg msg={nicknameMsg} />
                <ConfirmButton label="변경" disabled={nicknameLoading} />
              </div>
            </form>
          </section>

          {/* ── 비밀번호 변경 ── */}
          <section className="flex flex-col gap-[clamp(0.55rem,1.1vh,0.75rem)]">
            <h3 className={PANEL_HEADING_CLASS}>비밀번호 변경</h3>
            <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-[clamp(0.5rem,1vh,0.65rem)]">
              <AuthInputSlot
                name="currentPassword"
                value={pwForm.currentPassword}
                onChange={handlePwChange}
                placeholder="현재 비밀번호"
                autoComplete="current-password"
                passwordToggle
                leadingIcon={<LockIcon />}
              />
              <AuthInputSlot
                name="newPassword"
                value={pwForm.newPassword}
                onChange={handlePwChange}
                placeholder="새 비밀번호"
                autoComplete="new-password"
                passwordToggle
                leadingIcon={<LockIcon />}
              />
              <div className="flex items-center justify-between gap-3">
                <FeedbackMsg msg={pwMsg} />
                <ConfirmButton label="변경" disabled={pwLoading} />
              </div>
            </form>
          </section>

        </div>
      </div>
    </motion.div>
  )
}
