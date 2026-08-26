/**
 * 10일차 멀티 클라이언트 시나리오 전용 Playwright 설정.
 *
 * webServer는 의도적으로 쓰지 않는다 — backend(DEBUG_FIXED_ROLES 포함)와 frontend dev 서버는
 * 사람이 미리 띄워두는 실행 전제다(e2e/README.md 참고). 여기서 서버를 띄우면 DEBUG_FIXED_ROLES가
 * 빠진 채로 조용히 랜덤 배정이 되는 사고를 오히려 감추게 된다.
 */
import { defineConfig, devices } from "@playwright/test"
import { DEFAULT_E2E_BASE_URL } from "./lib/env.js"

export default defineConfig({
  testDir: "./tests",
  // 한 시나리오가 브라우저 컨텍스트 5개를 동시에 몰고 다닌다 — 병렬 실행은 서로의 방을 망친다.
  fullyParallel: false,
  workers: 1,
  // 재시도는 "10일을 처음부터 다시"라서 실패 원인을 가리기만 한다. trace/video로 남긴다.
  retries: 0,
  // 진입 연출 21회 × 5창 + 밤 10회 + 사망 영상 재생을 한 테스트가 통째로 감당한다.
  timeout: 15 * 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE_URL?.trim() || DEFAULT_E2E_BASE_URL,
    trace: "retain-on-failure",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    launchOptions: {
      // 사망 연출 <video>는 muted+playsInline이지만, 자동재생이 거부되면 오버레이가
      // "다시 재생" 상태로 멈춘다. 그 경로를 애초에 만들지 않는다.
      args: ["--autoplay-policy=no-user-gesture-required"],
    },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
})
