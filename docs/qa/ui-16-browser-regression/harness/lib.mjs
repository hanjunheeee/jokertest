// 공용 하네스 — 로컬 QA 더미 계정(qa01~qa10)으로 10개 브라우저 컨텍스트를 연다.
import { createRequire } from "node:module"
import { mkdirSync } from "node:fs"
const require = createRequire(import.meta.url)
export const { chromium } = require("C:/dev/pluto-ide/node_modules/playwright-core")

export const API = "http://localhost:4000"
export const WEB = "http://localhost:5173"
export const SHOTS = "C:/Users/minsa/jokertest/docs/qa/ui-16-browser-regression/shots"
mkdirSync(SHOTS, { recursive: true })

export const QA_PASSWORD = "QaLocal!2026"
export const accounts = (n = 10) =>
  Array.from({ length: n }, (_, i) => {
    const k = String(i + 1).padStart(2, "0")
    return { email: `qa${k}@local.test`, password: QA_PASSWORD, nickname: `QA${k}` }
  })

/** 더미 계정을 만든다. 이미 있으면(409) 그대로 둔다. */
export async function ensureAccounts(list) {
  for (const a of list) {
    const r = await fetch(`${API}/auth/signup`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(a),
    })
    if (r.status !== 201 && r.status !== 200 && r.status !== 409) {
      throw new Error(`signup ${a.email} -> ${r.status} ${await r.text()}`)
    }
  }
}

export async function launch() {
  return chromium.launch({ headless: true, executablePath: "C:/Users/minsa/AppData/Local/ms-playwright/chromium-1234/chrome-win64/chrome.exe" })
}

/** 로그인 폼을 통해 로그인한 컨텍스트/페이지를 돌려준다. */
export async function loginContext(browser, a, viewport = { width: 1280, height: 720 }) {
  const ctx = await browser.newContext({ viewport, locale: "ko-KR" })
  const page = await ctx.newPage()
  page.setDefaultTimeout(15000)
  await page.goto(`${WEB}/login`)
  await page.fill('input[name="email"]', a.email)
  await page.fill('input[name="password"]', a.password)
  await page.getByRole("button", { name: /^로그인$/ }).first().click()
  await page.waitForURL(/\/lobby/, { timeout: 15000 })
  return { ctx, page }
}

export async function shot(page, name) {
  const file = `${SHOTS}/${name}.png`
  await page.screenshot({ path: file, fullPage: false })
  return file
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
