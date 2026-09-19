/**
 * 방코드 읽기 전용 모달 — RoomInvitePage RoomCodeFrame 재사용
 * GameMatchingPage에서 "방코드 보기" 시 표시
 *
 * props
 * - open: 모달 표시 여부
 * - onClose: 배경·닫기 버튼 클릭 시 호출
 * - roomCode: 표시·복사할 6자리 방 코드 문자열
 *
 * 복사는 navigator.clipboard 사용, 입력은 readOnly (onChange 무시)
 * 닫기·복사 버튼 스타일은 constants/matchingPopupStyles.js, 프레임은 game/mode 참고
 *
 * 방코드는 숫자가 아니라 6자 영숫자입니다(서버 문자 집합은 utils/roomCode.js 주석 참고).
 * 복사 가능 여부 판정은 utils/roomCode.js가 전담하고, 이 컴포넌트는 그 결과를 화면에
 * 반영하기만 합니다 — 코드를 못 받았거나 형식이 깨졌으면 "복사됨"을 절대 띄우지 않고
 * role="alert" 영역으로 이유를 읽어줍니다.
 */
import { AnimatePresence, motion } from "framer-motion"
import { useEffect, useId, useRef, useState } from "react"
// 경로 별칭(@/) 대신 상대 경로를 쓰는 이유는 RoomListRow.jsx 맨 위 주석과 같습니다.
import RoomCodeFrame from "../../mode/components/RoomCodeFrame.jsx"
import { ROOM_INVITE_ASSETS } from "../../mode/constants/roomInviteAssets.js"
import { GAME_MATCHING_ASSETS } from "../constants/gameMatchingAssets.js"
import {
  ROOM_CODE_ACTION_BTN_LABEL_CLASS,
} from "../../mode/constants/roomCodeFrameStyles.js"
import {
  MATCHING_BTN_SCALE_WRAP_CLASS,
  MATCHING_BTN_IMG_SCALE_CLASS,
  MATCHING_MODAL_CLOSE_BTN_CLASS,
} from "../constants/matchingPopupStyles.js"
import {
  ROOM_CODE_COPY_ERRORS,
  ROOM_CODE_COPY_RESULTS,
  isValidRoomCode,
  normalizeRoomCode,
  resolveRoomCodeCopy,
  resolveRoomCodeCopyStatus,
} from "../utils/roomCode.js"
import PublicAsset from "../../../../shared/ui/PublicAsset.jsx"

const MODAL_TRANSITION = { duration: 0.35, ease: [0.22, 1, 0.36, 1] }

const POPUP_CLOSE_BUTTON = "/button/팝업 닫기 버튼.png"

// 복사 실패 안내 문구 스타일입니다. 복사 버튼 바로 아래(프레임 하단 영역)에 놓입니다.
/** 복사 버튼의 기본 스타일(원격과 같은 값)과, 확인 불가 상태의 비활성 스타일입니다. */
const COPY_BTN_CLASS =
  "group pointer-events-auto mx-auto w-[clamp(11.4rem,19%,15.25rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none"
const COPY_BTN_DISABLED_CLASS =
  "group pointer-events-auto mx-auto w-[clamp(11.4rem,19%,15.25rem)] shrink-0 cursor-not-allowed border-0 bg-transparent p-0 leading-none opacity-50"

const COPY_ERROR_CLASS =
  "mx-auto mt-[0.6rem] max-w-[90%] text-center font-subheading app-text-scaled [--app-text-size:clamp(0.78rem,1.15vw,0.95rem)] font-semibold leading-snug text-[#ffb3a7] [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"

const FRAME_VARIANTS = {
  hidden: {
    opacity: 0,
    y: -14,
    rotate: -1,
    scale: 0.99,
  },
  visible: {
    opacity: 1,
    y: 0,
    rotate: 0,
    scale: 1,
    transition: {
      type: "spring",
      stiffness: 260,
      damping: 32,
      mass: 1,
    },
  },
}

/** 방코드 6칸 읽기 전용 프레임 + 복사·닫기가 있는 오버레이 모달 */
export default function RoomCodeViewModal({ open, onClose, roomCode }) {
  // useState(초기값)은 [현재값, 값을 바꾸는 함수] 쌍을 반환하는 훅으로,
  // 값을 바꾸는 함수를 호출하면 컴포넌트가 다시 렌더링됩니다.
  // copied: 클립보드 복사 성공 여부. true인 동안 복사 버튼 라벨이 "복사됨"으로 바뀜
  const [copied, setCopied] = useState(false) // true면 복사 버튼 라벨 "복사됨" 표시
  // copyError: 복사가 실패한 이유. 빈 문자열이 아니면 role="alert" 영역이 이를 읽어줍니다.
  const [copyError, setCopyError] = useState("")
  // F-24(AC-01): 화면이 마지막으로 도달한 **상태 코드**. 문구와 달리 흔들리지 않는 식별자라
  // 시험과 외부 확인이 이 값으로 분기한다(아래 data-copy-status로 노출한다).
  const [copyStatus, setCopyStatus] = useState("")
  // useRef(초기값)은 값을 담는 상자({ current })를 반환하는 훅입니다.
  // useState와 달리 값이 바뀌어도 리렌더링을 일으키지 않고, 렌더링 사이에도
  // 값이 그대로 유지됩니다. 여기서는 setTimeout의 id를 저장해 뒀다가
  // 재복사·모달 닫기 시 이전 타이머를 취소하는 용도로 사용합니다.
  const copyFeedbackTimerRef = useRef(null)
  /**
   * F-24(AC-01): **복사 세대.** clipboard.writeText는 비동기라, 완료가 도착했을 때 화면이
   * 아직 같은 상황이라는 보장이 없습니다 — 그 사이 모달이 닫히거나, 코드가 바뀌거나, 계정·
   * 게임·소속·연결이 갈아끼워졌을 수 있습니다. 그런 옛 완료가 지금 화면의 "복사됨"을 켜면
   * 사용자는 방금 보고 있는 코드가 복사됐다고 믿게 됩니다(실제로는 이전 코드입니다).
   *
   * 그래서 전이마다 이 값을 올리고, 완료 처리 직전에 자기 세대가 아직 현재인지 확인합니다.
   * 여기서 하는 일은 **결과 반영을 막는 것**이지 외부 클립보드 작업 자체의 취소가 아닙니다 —
   * 이미 브라우저로 넘어간 쓰기를 화면이 되돌릴 수는 없습니다.
   */
  const copyGenerationRef = useRef(0)
  // useId는 서버/클라이언트가 같은 값을 만들어 주는 React 훅으로, 화면에 이 모달이 여러 번
  // 그려져도 겹치지 않는 id를 만들어 줍니다. 복사 버튼과 오류 문구를 연결하는 데 씁니다.
  const copyErrorId = useId()

  // 표시값과 복사값은 반드시 같은 문자열에서 나와야 합니다. roomCode가 아직 null이면
  // 표시 칸이 value[index]에서 터지므로 여기서 한 번만 빈 문자열로 정규화합니다.
  const displayRoomCode = normalizeRoomCode(roomCode)
  // F-24(AC-01): 복사할 수 있는 값인지는 클릭 전에 이미 알 수 있습니다. 모르는 채로 버튼을
  // 열어 두면 사용자는 눌러 보고 나서야 실패를 알게 되므로, 확인 불가 상태를 진입 시점에
  // 그대로 보여주고 복사 버튼을 비활성화합니다.
  const canCopy = isValidRoomCode(displayRoomCode)

  /** 예약된 복사 피드백 타이머를 취소합니다(중복 취소해도 안전). */
  const clearCopyFeedbackTimer = () => {
    if (!copyFeedbackTimerRef.current) return
    window.clearTimeout(copyFeedbackTimerRef.current)
    copyFeedbackTimerRef.current = null
  }

  /**
   * F-24(AC-01): 복사 피드백을 무효화하는 **유일한 경계**입니다. 세대를 올리고, 예약된 타이머를
   * 풀고, 표시 중인 성공·실패를 지웁니다 — 셋 중 하나만 하면 나머지가 어긋납니다.
   */
  const invalidateCopyFeedback = () => {
    copyGenerationRef.current += 1
    clearCopyFeedbackTimer()
    setCopied(false)
    setCopyError("")
    setCopyStatus("")
  }

  // 열림 상태와 표시 코드가 바뀔 때마다 이전 복사 결과를 버립니다. 언마운트도 같은 경계라
  // cleanup에서 세대를 올려, 마지막 요청의 늦은 완료가 다시 마운트된 모달에 끼어들 수 없게
  // 합니다(타이머도 함께 풀어 둡니다 — 남기면 사라진 컴포넌트를 향해 울립니다).
  useEffect(() => {
    invalidateCopyFeedback()
    return () => {
      copyGenerationRef.current += 1
      clearCopyFeedbackTimer()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, displayRoomCode])

  /** 모달 닫기 시 복사 피드백·오류 안내와 예약된 타이머를 함께 정리합니다. */
  const handleClose = () => {
    invalidateCopyFeedback()
    onClose()
  }

  /**
   * 화면에 표시 중인 방코드를 클립보드에 복사하고 2초간 "복사됨"을 표시합니다.
   * 복사할 수 없는 상태(코드 미수신·형식 오류·클립보드 거부)에서는 성공 표시를 하지 않고
   * 대신 오류 문구를 남깁니다 — "복사됨"만 뜨고 실제로는 아무것도 복사되지 않는 상황을
   * 사용자가 알아챌 방법이 없기 때문입니다.
   */
  const handleCopy = async () => {
    const outcome = resolveRoomCodeCopy(displayRoomCode)

    if (!outcome.ok) {
      // 클립보드를 아예 건드리지 않는다 — 빈 값을 써넣어 사용자의 기존 복사 내용을
      // 덮어쓰는 것이 "복사 실패"보다 더 나쁜 결과다.
      invalidateCopyFeedback()
      setCopyError(outcome.error)
      setCopyStatus(resolveRoomCodeCopyStatus(displayRoomCode))
      return
    }

    // 이번 요청의 세대. 이전 보류 요청은 여기서 이미 무효가 된다 — 한 번의 유효한 완료당
    // 타이머가 정확히 하나만 살아 있게 하는 근거이기도 하다.
    invalidateCopyFeedback()
    const generation = copyGenerationRef.current

    try {
      await navigator.clipboard.writeText(outcome.value)
      // 늦게 도착한 옛 성공은 지금 화면의 사실이 아니다 — 피드백도 타이머도 만들지 않는다.
      if (copyGenerationRef.current !== generation) return
      setCopied(true)
      setCopyError("")
      setCopyStatus(ROOM_CODE_COPY_RESULTS.COPY_SUCCEEDED)
      copyFeedbackTimerRef.current = window.setTimeout(() => {
        // 타이머가 깨어난 순간에도 같은 세대여야 한다(그 사이 새 요청이 자기 타이머를 걸었다면
        // 이 만료는 그 요청의 "복사됨"을 대신 꺼 버리는 셈이 된다).
        if (copyGenerationRef.current !== generation) return
        setCopied(false)
        copyFeedbackTimerRef.current = null
      }, 2000)
    } catch {
      // 권한 거부·비보안 컨텍스트 등. navigator.clipboard 자체가 없어 TypeError가 나는
      // 경우도 여기로 들어온다(속성 접근이 try 안에 있기 때문).
      if (copyGenerationRef.current !== generation) return
      setCopied(false)
      setCopyError(ROOM_CODE_COPY_ERRORS.CLIPBOARD_FAILED)
      setCopyStatus(ROOM_CODE_COPY_RESULTS.CLIPBOARD_FAILED)
    }
  }

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            type="button"
            aria-label="방코드 보기 닫기"
            className="absolute inset-0 z-40 cursor-default border-0 bg-black/60 p-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={MODAL_TRANSITION}
            onClick={handleClose}
          />

          <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center px-[clamp(1rem,4vw,2.5rem)]">
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label="방코드"
              className="pointer-events-auto w-full max-w-[min(52rem,94vw)]"
              initial="hidden"
              animate="visible"
              exit="hidden"
              variants={FRAME_VARIANTS}
              onClick={(event) => event.stopPropagation()}
            >
              <RoomCodeFrame
                frameSrc={GAME_MATCHING_ASSETS.roomCodeShareFrame}
                frameAlt="초대 방코드"
                value={displayRoomCode}
                onChange={() => {}} // readOnly — 입력 변경 없음
                readOnly
                overlay={
                  <button
                    type="button"
                    aria-label="방코드 팝업 닫기"
                    onClick={handleClose}
                    className={MATCHING_MODAL_CLOSE_BTN_CLASS}
                  >
                    <PublicAsset
                      src={POPUP_CLOSE_BUTTON}
                      alt=""
                      className={MATCHING_BTN_IMG_SCALE_CLASS}
                    />
                  </button>
                }
                footer={
                  <>
                    <button
                      type="button"
                      aria-label={copied ? "방코드 복사됨" : "방코드 복사"}
                      aria-describedby={copyError ? copyErrorId : undefined}
                      onClick={handleCopy}
                      // F-24(AC-01): 확인할 수 없는 코드에는 복사 자체를 열지 않는다. 안내는
                      // 아래 alert 영역이 이미 읽어 주므로, 버튼은 "눌러도 되는가"만 말한다.
                      disabled={!canCopy}
                      data-copy-status={copyStatus || (canCopy ? "" : ROOM_CODE_COPY_RESULTS.CODE_UNAVAILABLE)}
                      className={canCopy ? COPY_BTN_CLASS : COPY_BTN_DISABLED_CLASS}
                    >
                      <span className={MATCHING_BTN_SCALE_WRAP_CLASS}>
                        <PublicAsset
                          src={ROOM_INVITE_ASSETS.joinButton}
                          alt=""
                          className="block h-auto w-full select-none"
                        />
                        <span className={ROOM_CODE_ACTION_BTN_LABEL_CLASS} aria-hidden="true">
                          {copied ? "복사됨" : "방코드 복사"}
                        </span>
                      </span>
                    </button>

                    {/*
                      오류 영역은 문구가 없을 때도 계속 렌더링해 둡니다. role="alert" 영역은
                      "이미 존재하던 영역의 내용이 바뀔 때" 가장 안정적으로 읽히고, 오류가
                      생긴 순간 새로 mount되면 일부 스크린리더가 놓칩니다.
                    */}
                    {/*
                      F-24(AC-01): 코드를 확인할 수 없는 상태는 **누르기 전에** 읽어 줍니다.
                      복사 시도로 생긴 오류가 있으면 그쪽이 더 구체적이므로 우선합니다.
                    */}
                    <p id={copyErrorId} role="alert" className={COPY_ERROR_CLASS}>
                      {copyError || (canCopy ? "" : ROOM_CODE_COPY_ERRORS.UNAVAILABLE)}
                    </p>
                  </>
                }
              />
            </motion.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  )
}
