/**
 * 모바일 UI 스크린샷 일괄 캡처 (주요 라우트·모달)
 * 실행: npm run dev:mobile 켠 뒤
 *   set SCREENSHOT_EMAIL=... & set SCREENSHOT_PASSWORD=... & node scripts/capture-ui-screenshots.mjs
 *   set SCREENSHOT_HEADED=1  (배경 영상 검정일 때 브라우저 창 켜고 캡처)
 *   set SCREENSHOT_AUTH_VIDEO_SEEK=5  (인증 배경 video seek 초, 기본 4.5)
 * Playwright: npx playwright install chromium (최초 1회)
 */
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { chromium, devices } from "playwright"
import { prepareAuthBackdropForScreenshot } from "./auth-backdrop-screenshot.mjs"

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..")
const outDir = path.join(root, "docs", "screenshots", "png")
const baseUrl = process.env.SCREENSHOT_BASE_URL || "http://localhost:5174"
const email = process.env.SCREENSHOT_EMAIL || ""
const password = process.env.SCREENSHOT_PASSWORD || ""
const headed = process.env.SCREENSHOT_HEADED === "1"
const authVideoSeek = Number(process.env.SCREENSHOT_AUTH_VIDEO_SEEK || "4.5")

fs.mkdirSync(outDir, { recursive: true })

async function shot(page, name, { videoBackdrop = false } = {}) {
  const file = path.join(outDir, `${name}.png`)
  // videoBackdrop: animations disabled면 <video>가 0초 프레임(검정)에 멈춤 → allow
  await page.screenshot({
    path: file,
    type: "png",
    animations: videoBackdrop ? "allow" : "disabled",
  })
  console.log("ok", name)
}

async function waitUi(page, ms = 800) {
  await page.waitForTimeout(ms)
}

/** 인증 라우트가 실제로 그려졌는지 확인 (옛 401→/login 리다이렉트·타이밍 방지) */
async function waitForAuthScreen(page, kind) {
  const waits = {
    login: () => page.getByPlaceholder("이메일을 입력하세요").waitFor({ state: "visible", timeout: 15000 }),
    signup: () =>
      page.getByPlaceholder("비밀번호를 다시 입력하세요").waitFor({ state: "visible", timeout: 15000 }),
    "find-id": async () => {
      await page.waitForURL("**/find-id", { timeout: 15000 })
      await page.getByPlaceholder("닉네임을 입력하세요").waitFor({ state: "visible", timeout: 15000 })
    },
    "pw-request": async () => {
      await page.waitForURL("**/password-reset/request", { timeout: 15000 })
      await page.getByPlaceholder("가입할 때 등록한 이메일을 입력하세요").waitFor({ state: "visible", timeout: 15000 })
    },
  }
  await waits[kind]()
}

async function skipIntroVideo(page) {
  const skip = page.getByRole("button", { name: /건너뛰|skip/i })
  if (await skip.isVisible().catch(() => false)) {
    await skip.click()
    await waitUi(page, 600)
  }
}

async function login(page) {
  if (!email || !password) {
    console.warn("SCREENSHOT_EMAIL/PASSWORD 없음 → 로그인 필요 화면은 스킵")
    return false
  }
  await page.goto(`${baseUrl}/login`)
  await waitForAuthScreen(page, "login")
  await waitUi(page, 400)
  const close = page.getByRole("button", { name: /안내 닫기|확인/ }).first()
  if (await close.isVisible().catch(() => false)) await close.click()
  await page.getByPlaceholder("이메일을 입력하세요").fill(email)
  await page.getByPlaceholder("비밀번호를 입력하세요").fill(password)
  await page.getByRole("button", { name: "로그인", exact: true }).click()
  await page.waitForURL(/\/(lobby|mypage)/, { timeout: 20000 }).catch(() => null)
  await waitUi(page, 1200)
  return page.url().includes("lobby") || !page.url().includes("login")
}

async function main() {
  const browser = await chromium.launch({
    headless: !headed,
    args: ["--autoplay-policy=no-user-gesture-required"],
  })
  if (headed) console.log("headed 모드 (SCREENSHOT_HEADED=1)")
  const context = await browser.newContext({
    ...devices["iPhone 13"],
    locale: "ko-KR",
  })
  const page = await context.newPage()

  const authOnly = process.env.SCREENSHOT_ONLY === "auth"

  const gotoOpts = { waitUntil: "load", timeout: 30000 }

  const authBackdropDebug = process.env.SCREENSHOT_DEBUG_VIDEO === "1"

  await page.goto(`${baseUrl}/login`, gotoOpts)
  await waitForAuthScreen(page, "login")
  await prepareAuthBackdropForScreenshot(page, authVideoSeek, { debug: authBackdropDebug })
  let close = page.getByRole("button", { name: /안내 닫기/ })
  if (await close.isVisible().catch(() => false)) await close.click()
  await shot(page, "01-auth-login", { videoBackdrop: true })
  await page.getByRole("button", { name: "회원가입", exact: true }).click()
  await waitForAuthScreen(page, "signup")
  await waitUi(page, 400)
  await shot(page, "02-auth-signup", { videoBackdrop: true })
  await page.goto(`${baseUrl}/find-id`, gotoOpts)
  await waitForAuthScreen(page, "find-id")
  await prepareAuthBackdropForScreenshot(page, authVideoSeek, { debug: authBackdropDebug })
  await shot(page, "03-auth-find-id", { videoBackdrop: true })
  await page.goto(`${baseUrl}/password-reset/request`, gotoOpts)
  await waitForAuthScreen(page, "pw-request")
  await prepareAuthBackdropForScreenshot(page, authVideoSeek, { debug: authBackdropDebug })
  await shot(page, "04-auth-pw-request", { videoBackdrop: true })

  if (authOnly) {
    await browser.close()
    return
  }

  const loggedIn = await login(page)
  if (!loggedIn) {
    await browser.close()
    return
  }

  await page.goto(`${baseUrl}/lobby`)
  await waitUi(page, 1500)
  await skipIntroVideo(page)
  await shot(page, "05-lobby-main")

  await page.getByRole("button", { name: /알림/ }).click().catch(() => null)
  await waitUi(page, 600)
  if (await page.getByRole("dialog").isVisible().catch(() => false)) {
    await shot(page, "06-lobby-notifications")
    await page.keyboard.press("Escape")
    await waitUi(page, 300)
  }

  await page.getByRole("button", { name: /친구/ }).click().catch(() => null)
  await waitUi(page, 600)
  if (await page.getByRole("dialog").isVisible().catch(() => false)) {
    await shot(page, "07-lobby-friends")
    await page.keyboard.press("Escape")
    await waitUi(page, 300)
  }

  await page.goto(`${baseUrl}/mypage`)
  await waitUi(page, 1000)
  await shot(page, "08-mypage-main")

  await page.goto(`${baseUrl}/mypage?sheet=profile-edit`)
  await waitUi(page, 800)
  await shot(page, "09-mypage-profile-edit")
  await page.goto(`${baseUrl}/mypage`)
  await waitUi(page, 400)

  await page.goto(`${baseUrl}/mypage?sheet=skin-card-wear`)
  await waitUi(page, 800)
  await shot(page, "10-mypage-wear")
  await page.goto(`${baseUrl}/mypage`)

  await page.goto(`${baseUrl}/mypage/emoticons`)
  await waitUi(page, 1000)
  await shot(page, "11-emoticon-page")

  await page.goto(`${baseUrl}/account`)
  await waitUi(page, 800)
  await shot(page, "12-account-main")

  await page.goto(`${baseUrl}/setting`)
  await waitUi(page, 1500)
  await skipIntroVideo(page)
  await shot(page, "13-setting-general")

  await page.goto(`${baseUrl}/store`)
  await waitUi(page, 1500)
  await skipIntroVideo(page)
  await shot(page, "14-store-main")

  await page.goto(`${baseUrl}/library`)
  await waitUi(page, 1200)
  await shot(page, "15-library-forbidden")

  await page.getByRole("button", { name: /초대받은/ }).click().catch(() => null)
  await waitUi(page, 800)
  await shot(page, "16-library-guests")

  await page.goto(`${baseUrl}/gameMode`)
  await waitUi(page, 800)
  await shot(page, "17-gamemode-main")

  await page.goto(`${baseUrl}/multiplay`)
  await waitUi(page, 800)
  await shot(page, "18-multiplay-main")

  await page.goto(`${baseUrl}/roomInvite`)
  await waitUi(page, 800)
  await shot(page, "19-room-invite-main")

  await browser.close()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
