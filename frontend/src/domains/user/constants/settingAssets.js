/** 로비 설정 화면 public 에셋 경로 (frontend/public 기준) */
export const SETTING_ASSETS = {
  bgVideo: "/bg/로비 설정창 영상.mp4",
  tabActive: "/button/옵션버튼(활성화).png",
  tabInactive: "/button/옵션버튼(비활성화).png",
  backButton: "/button/뒤로가기 버튼2.png",
  inputField: "/button/입력창1.png",
  checkbox: "/button/체크박스2.png",
  checkMark: "/button/체크표시.png",
  arrow: "/button/이동 화살표.png",
  scrollTrack: "/frame/빈 스크롤바.png",
  scrollThumb: "/frame/스크롤 롤러.png",
}

export const SCREEN_SHAKE_LEVELS = ["끄기", "낮음", "보통", "높음"]

export const SETTING_TABS = [
  { id: "general", label: "일반" },
  { id: "graphics", label: "그래픽" },
  { id: "sound", label: "소리" },
  { id: "input", label: "입력" },
]

/** prototype 로비 설정창.png — 일반 탭 항목 */
export const GENERAL_SETTINGS = [
  { id: "language", type: "dropdown", label: "언어", value: "한국어" },
  {
    id: "screen-shake",
    type: "stepper",
    label: "화면 흔들림",
    options: SCREEN_SHAKE_LEVELS,
    defaultIndex: 2,
  },
  { id: "fast-mode", type: "checkbox", label: "고속 모드", defaultChecked: true },
  { id: "horror-ease", type: "checkbox", label: "공포 완화 모드", defaultChecked: false },
  { id: "timer", type: "checkbox", label: "타이머 항상 표시", defaultChecked: true },
  { id: "hand-count", type: "checkbox", label: "손에 있는 카드 숫자 표시", defaultChecked: true },
  {
    id: "multiplayer-drawings",
    type: "checkbox",
    label: "Show Multiplayer Drawings",
    defaultChecked: true,
  },
  { id: "long-press", type: "checkbox", label: "길게 눌러 확인", defaultChecked: false },
  { id: "skip-intro", type: "checkbox", label: "인트로 로고 건너뛰기", defaultChecked: true },
  { id: "fps-limit", type: "checkbox", label: "백그라운드에서 FPS 제한", defaultChecked: true },
  {
    id: "upload-data",
    type: "checkbox",
    label: "게임플레이 데이터 업로드",
    defaultChecked: true,
  },
]
