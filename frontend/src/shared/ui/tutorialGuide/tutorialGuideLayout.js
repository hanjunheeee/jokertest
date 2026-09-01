export const TUTORIAL_GUIDE_BACKDROP_CLASS =
  "fixed inset-0 z-[100] cursor-pointer border-0 bg-black/82 p-0"

export const TUTORIAL_GUIDE_SHELL_CLASS =
  "pointer-events-none fixed inset-0 z-[101] flex items-center justify-center px-[clamp(0.75rem,2.5vw,2rem)] py-[clamp(1rem,4vh,2rem)]"

export const TUTORIAL_GUIDE_PANEL_CLASS =
  "pointer-events-auto flex max-h-[min(88vh,52rem)] w-[min(92vw,56rem)] flex-col items-stretch gap-[clamp(0.75rem,1.8vh,1.25rem)]"

export const TUTORIAL_GUIDE_SLIDE_WRAP_CLASS =
  "relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-sm bg-black/35"

export const TUTORIAL_GUIDE_SLIDE_IMAGE_CLASS =
  "block max-h-[min(72vh,46rem)] w-full select-none object-contain object-center"

export const TUTORIAL_GUIDE_CONTROLS_CLASS =
  "flex shrink-0 items-center justify-center gap-[clamp(0.75rem,2vw,1.5rem)]"

export const TUTORIAL_GUIDE_ARROW_BTN_CLASS =
  "interactive-scale block w-[clamp(2.75rem,4vw,3.5rem)] shrink-0 cursor-pointer border-0 bg-transparent p-0 opacity-90 transition hover:opacity-100 disabled:cursor-default disabled:opacity-25"

export const TUTORIAL_GUIDE_ARROW_IMG_CLASS = "block h-auto w-full select-none"

export const TUTORIAL_GUIDE_NODES_CLASS =
  "flex min-w-0 flex-1 flex-wrap items-center justify-center gap-[clamp(0.35rem,0.75vw,0.55rem)]"

export const TUTORIAL_GUIDE_NODE_BASE_CLASS =
  "h-[clamp(0.55rem,0.85vw,0.7rem)] w-[clamp(0.55rem,0.85vw,0.7rem)] shrink-0 cursor-pointer rounded-full border border-[#e8dcc8]/55 bg-transparent p-0 transition"

export const TUTORIAL_GUIDE_NODE_ACTIVE_CLASS =
  "border-[#f5e6c8] bg-[#f5e6c8] shadow-[0_0_0.35rem_rgba(245,230,200,0.45)]"

export const TUTORIAL_GUIDE_TRANSITION = { duration: 0.35, ease: [0.22, 1, 0.36, 1] }
