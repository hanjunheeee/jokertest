// 방코드 보기 모달 모양·움직임 상수
// components/RoomCodeViewModal이 씀

export const MODAL_TRANSITION = { duration: 0.35, ease: [0.22, 1, 0.36, 1] }

export const POPUP_CLOSE_BUTTON = "/button/팝업 닫기 버튼.png"

// 복사 버튼: 쓸 수 있을 때 / 못 쓸 때
export const COPY_BTN_CLASS =
  "group pointer-events-auto mx-auto w-[clamp(11.4rem,19%,15.25rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 leading-none"
export const COPY_BTN_DISABLED_CLASS =
  "group pointer-events-auto mx-auto w-[clamp(11.4rem,19%,15.25rem)] shrink-0 cursor-not-allowed border-0 bg-transparent p-0 leading-none opacity-50"

export const COPY_ERROR_CLASS =
  "mx-auto mt-[0.6rem] max-w-[90%] text-center font-subheading app-text-scaled [--app-text-size:clamp(0.78rem,1.15vw,0.95rem)] font-semibold leading-snug text-[#ffb3a7] [text-shadow:0_1px_2px_rgba(0,0,0,0.9)]"

// 프레임이 위에서 살짝 내려오며 나타남
export const FRAME_VARIANTS = {
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
