import assert from "node:assert/strict"
import test from "node:test"
import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { register } from "node:module"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { JSDOM } from "jsdom"
import React from "react"

// F-18 AC-05/AC-06 통합 시험.
//
// 두 가지를 한 파일에서 고정한다.
//   (1) 실제 app/routes/index.jsx가 내보내는 **그 라우터**와 실제 ProtectedRoute를 렌더해
//       /podium 진입이 인증 상태에 따라 어떻게 처리되는지 — 라우터 정의를 시험 안에서
//       복제하지 않는다(복제하면 production이 바뀌어도 시험은 통과한다).
//   (2) podium 도메인 소스와 이미지가 **삭제되지 않고 그대로 보존**되어 있는지 —
//       진입만 끊고 자산은 남긴다는 것이 AC-06의 요구다.
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", {
  url: "http://localhost/",
  pretendToBeVisual: true,
})

function installDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true })
}

installDomGlobal("window", dom.window)
installDomGlobal("document", dom.window.document)
installDomGlobal("navigator", dom.window.navigator)
installDomGlobal("localStorage", dom.window.localStorage)
installDomGlobal("HTMLElement", dom.window.HTMLElement)
installDomGlobal("Element", dom.window.Element)
installDomGlobal("Node", dom.window.Node)
installDomGlobal("Event", dom.window.Event)
installDomGlobal("MutationObserver", dom.window.MutationObserver)
installDomGlobal("requestAnimationFrame", dom.window.requestAnimationFrame.bind(dom.window))
installDomGlobal("cancelAnimationFrame", dom.window.cancelAnimationFrame.bind(dom.window))
installDomGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} })
installDomGlobal("IntersectionObserver", class { observe() {} unobserve() {} disconnect() {} })

// ProtectedRoute는 인증되지 않은 진입에 alert로 안내한다(렌더 후 useEffect). jsdom의 기본
// alert는 "not implemented"를 던지므로, 실제 컴포넌트를 그대로 마운트하기 위해 조용한
// 스텁으로 바꾼다 — 호출 여부 자체는 이 시험의 대상이 아니다.
installDomGlobal("alert", () => {})
dom.window.alert = () => {}

globalThis.IS_REACT_ACT_ENVIRONMENT = true

// 이 저장소 관례: "@/" alias 해석 + JSX 변환 ESM 훅을 재사용한다(production 무변경).
register(new URL("../../domains/game/ingame/__tests__/testSupport/jsxNodeLoaderHooks.mjs", import.meta.url))

const { mock } = await import("node:test")

// import.meta.env는 Vite 빌드타임 치환이라 plain Node에서 해석되지 않는다 — 경계 모듈
// 하나만 갈아끼우고 나머지 라우터·페이지·가드는 전부 실제 코드로 돌린다.
mock.module("../../shared/env.js", {
  namedExports: {
    API_BASE_URL: "http://localhost:4000",
    DISCORD_SUPPORT_URL: undefined,
  },
})

// 라우트가 렌더되며 실제로 부르는 서버 호출만 경계에서 막는다(네트워크 없음).
mock.module("../../shared/api/client.js", {
  namedExports: {
    api: {
      get: async () => { throw new Error("network disabled in test") },
      post: async () => { throw new Error("network disabled in test") },
      put: async () => { throw new Error("network disabled in test") },
      patch: async () => { throw new Error("network disabled in test") },
      delete: async () => { throw new Error("network disabled in test") },
    },
    apiClient: async () => { throw new Error("network disabled in test") },
    refreshAccessToken: async () => { throw new Error("network disabled in test") },
  },
})

const { render, act, cleanup, waitFor } = await import("@testing-library/react")
const { RouterProvider } = await import("react-router-dom")
const { router } = await import("../routes/index.jsx")
const { useAuthStore } = await import("../../domains/auth/store/auth.store.js")

test.afterEach(() => cleanup())

async function mountRouter() {
  let view
  await act(async () => {
    view = render(React.createElement(RouterProvider, { router }))
  })
  return view
}

async function goTo(path) {
  await act(async () => { await router.navigate(path) })
}

async function goBack() {
  await act(async () => { await router.navigate(-1) })
}

function setAuthenticated(isAuthenticated) {
  useAuthStore.setState({
    isLoggedIn: isAuthenticated,
    user: isAuthenticated ? { uuid: "user-1", nickname: "테스터" } : null,
    loggedOutIntentionally: false,
  })
}

test("F-18 AC-05: 로그인한 사용자가 /podium으로 직접 들어오면 명예의 전당 화면 대신 /lobby로 replace 이동한다", async () => {
  setAuthenticated(true)
  await goTo("/")
  const view = await mountRouter()

  await goTo("/podium")
  await waitFor(() => assert.equal(router.state.location.pathname, "/lobby"))

  assert.equal(router.state.historyAction, "REPLACE", "리다이렉트는 뒤로가기 반복을 만들지 않도록 replace여야 한다")

  // podium 화면 자체가 그려지지 않았음을 실제 DOM으로 확인한다 — PodiumBackground가 그리는
  // 배경 이미지가 어디에도 없어야 한다.
  const { PODIUM_ASSETS } = await import("../../domains/podium/constants/podiumAssets.js")
  const { publicAsset } = await import("../../shared/utils/publicAsset.js")
  const podiumBackgroundSrc = publicAsset(PODIUM_ASSETS.background)
  assert.equal(
    view.container.querySelector(`img[src="${podiumBackgroundSrc}"]`),
    null,
    "명예의 전당 화면이 여전히 렌더되고 있습니다.",
  )
})

test("F-18 AC-05: /podium에서 /lobby로 replace 이동한 뒤 뒤로가면 /podium으로 되돌아가지 않는다", async () => {
  setAuthenticated(true)
  await goTo("/")
  await mountRouter()

  await goTo("/podium")
  await waitFor(() => assert.equal(router.state.location.pathname, "/lobby"))

  await goBack()
  await waitFor(() => assert.notEqual(router.state.location.pathname, "/lobby"))

  assert.notEqual(
    router.state.location.pathname,
    "/podium",
    "replace 이동이라 /podium은 히스토리에 남아 있지 않아야 한다(왕복 반복 금지)",
  )
})

test("F-18 AC-05: 로그인하지 않은 사용자의 /podium 진입은 보호 경계가 먼저 가로채 /login으로 replace 이동한다", async () => {
  setAuthenticated(false)
  await goTo("/")
  await mountRouter()

  await goTo("/podium")
  await waitFor(() => assert.equal(router.state.location.pathname, "/login"))

  assert.equal(router.state.historyAction, "REPLACE")
  assert.notEqual(
    router.state.location.pathname,
    "/lobby",
    "미인증 사용자는 /login을 건너뛰고 곧장 로비로 들어가면 안 된다(보호 경계 유지)",
  )
})

// ---------------------------------------------------------------------------
// AC-06 — podium 소스·이미지 보존
//
// 기준 커밋 11e95027(F-18 착수 시점 HEAD)에서 확인한 Git 추적 목록과 blob 식별값을 여기에
// 고정한다. 실행 시점의 Git HEAD를 다시 읽지 않으므로, "현재 상수/현재 트리"를 함께 줄여서
// 검사를 통과시키는 우회가 불가능하다.
// ---------------------------------------------------------------------------
const srcDir = fileURLToPath(new URL("../../", import.meta.url))
const publicDir = fileURLToPath(new URL("../../../public/", import.meta.url))

/** git이 blob에 붙이는 식별값과 같은 방식으로 파일 내용을 해시한다. */
function gitBlobSha1(bytes) {
  return createHash("sha1").update(`blob ${bytes.length}\0`).update(bytes).digest("hex")
}

/** 기준 커밋의 podium 도메인 Git 추적 소스 17개 (src/ 기준 상대 경로 → blob sha1). */
const PODIUM_SOURCE_BASELINE = {
  "domains/podium/__tests__/podiumConstants.test.js": "106825165ca1f81808d0b8c31968433479814846",
  "domains/podium/components/PodiumBackground.jsx": "4b5848597e210e97680568cf8b90ee3588cf5115",
  "domains/podium/components/PodiumHeader.jsx": "39b29691fe0fa254228140b6acbae2825ee9fac5",
  "domains/podium/components/rankingTable/PodiumRankingTable.jsx": "2d7e29ac424107a8f75908534eba8d4a1539bf74",
  "domains/podium/components/rankingTable/PodiumRankingTableColumn.jsx": "cae0b35b9e4494caa7e78411716a0d5ee4080f03",
  "domains/podium/components/rankingTable/PodiumRankingTableNavArrow.jsx": "6d10d4a57806c180bf7566015b740905be773ff7",
  "domains/podium/components/rankingTable/PodiumRankingTablePageNodes.jsx": "27e0768399b7e47e276bc2967ce51e8a66e7153d",
  "domains/podium/components/rankingTable/PodiumRankingTableShell.jsx": "054f9b6b9ffd880044fbe7789670c97822fb20f8",
  "domains/podium/components/topThree/PodiumTopPlayerCard.jsx": "8bcac6687468abd31c46ab689936ea548c009ee2",
  "domains/podium/components/topThree/PodiumTopThree.jsx": "8780c78e9fe8497207f52b87d9e68dc6d843907b",
  "domains/podium/constants/podiumAssets.js": "6bb18b29e65b535835136c8ad25618d895269a1b",
  "domains/podium/constants/podiumEntranceMotion.js": "8cc29c04ce00f90773f925aeb0c7814dbaae1117",
  "domains/podium/constants/podiumLayoutStyle.js": "632a2ba1a01711ef5b11c3e70c5869be986cc106",
  "domains/podium/constants/podiumRankingTableNav.js": "65eb4c7708ab73305f068cb037836ad0a8f5ba73",
  "domains/podium/content/podiumRankingDummy.js": "9c5c72d193859ceff7f5b8fc6cc7b98c38f99be9",
  "domains/podium/pages/PodiumPage.jsx": "ced6590848615a1b5b67f07fac31a7b8366315a7",
  "domains/podium/utils/podiumRankingUtils.js": "b76d81bc811ba8fa2692d1292966f7711365ae6a",
}

/** 기준 커밋에서 확인한 36개 에셋 (public/ 기준 NFC 경로 → blob sha1). */
const PODIUM_ASSET_BASELINE = {
  "/bg/명예의 전당 뒷배경.png": "3550882cabaf54f8aec0c87bdb09d9be901d6be6",
  "/frame/탑레벨 프레임_1_.png": "b2688ea74ba91c3f6115fee0050721867eb9ded6",
  "/frame/podium/랭킹테이블 프레임.png": "6b769e16caa7feb7c58e1314a7e34e1dda2955e0",
  "/frame/podium/랭킹1위 프레임.png": "7fc928a36e8e762939ba0b5932337db52120fc8e",
  "/frame/podium/랭킹2위 프레임.png": "0368fd36bc8cdb5524cb5993ab2fec302a636771",
  "/frame/podium/랭킹3위 프레임.png": "d08b4d96c3c6ddb56ef0b5eed946f8e69e3ccb85",
  "/button/이동 화살표2.png": "0194b39110074089cbfce2671b6010a5b7e4eeaf",
  "/button/lobby-menu/명예의전당_3.png": "58676ebe3fea8a608f5601d968f5d0d55d47478d",

  "/shopItem/player-profile/프로필-금빛가면.png": "53ac47378781e717add951f944e871c108473b85",
  "/shopItem/player-profile/프로필-기사.png": "19542dba0d6127e0089d60a280aa78d5c7a94350",
  "/shopItem/player-profile/프로필-사냥꾼.png": "6af45653d29c5cc9c5c6567ec19af842df404eec",
  "/shopItem/player-profile/프로필-귀부인.png": "2ace1137e28e24c6c79fed9fba6b4dad6c812b6a",
  "/shopItem/player-profile/프로필-영주.png": "45f61ab0bf20149e5774f7c32686b06ebad52ecf",
  "/shopItem/player-profile/프로필-암살자.png": "7e5b8826501ba9b8212cbb4bdb553a72d7858e57",
  "/shopItem/player-profile/프로필-그림자.png": "f45efe2c5a277b8807d54f4de7a34b61e1c12f08",
  "/shopItem/player-profile/프로필-악당.png": "aad45fd4ff0700a4d6491a756dffc2594793108d",
  "/shopItem/player-profile/프로필-역병의사.png": "ec51b8e6887e771d34be9716eabdcd59ea1d24bb",
  "/shopItem/player-profile/프로필-음유시인.png": "aa00407ca0477fdc9e7bae035286f86d6d866968",
  "/shopItem/player-profile/프로필-영애.png": "57dbff9ec44dc077570c43c23fb713bff935b0ab",
  "/shopItem/player-profile/프로필-붉은기운.png": "3891fde44e9cc4349b0f3fa6ef33fddd9ab9ed37",
  "/shopItem/player-profile/프로필-화관쓴소녀.png": "40bbe4d2746eac5e6d1c5622e456a21a226beadf",
  "/shopItem/player-profile/프로필-드워프.png": "ac842ae9a29899adb523e9f7d3fa7caa9bd2d87d",
  "/shopItem/player-profile/프로필-수녀.png": "967938f06c563160f584ec6cb4f27c22399aaf53",
  "/shopItem/player-profile/프로필-마인.png": "3b02b2fa87b2d7a0c633db45d235363745108541",

  "/shopItem/player- profileborder/프로필프레임-황제.png": "0555aee9217ede3b18929e81bbf8cbc2ce08fdb6",
  "/shopItem/player- profileborder/프로필프레임-공작.png": "b060cf640de26a935f726976dcb3512015601844",
  "/shopItem/player- profileborder/프로필프레임-백작.png": "57ac2df43c09414db5f70a9bfaad9974879cc0c5",
  "/shopItem/player- profileborder/프로필프레임-후작.png": "8f52364a0951d189d136d1dec5aa11749f1648d0",
  "/shopItem/player- profileborder/프로필프레임-남작.png": "c1b54282392cbb80a34f2aecab8e19f9fc690d55",
  "/shopItem/player- profileborder/프로필프레임-자작.png": "c2b045b4a86199a0578012d15705cfc6a964d0bf",
  "/shopItem/player- profileborder/프로필프레임-귀족.png": "262b8faa38df2d061c99878192df66260092cbab",
  "/shopItem/player- profileborder/프로필프레임-광대.png": "26144820b61a7e0205b3cf101ff5710b414438f1",
  "/shopItem/player- profileborder/프로필프레임-주치의.png": "ce48ecffc6db25d6327a8b7916d44f9909d57faa",
  "/shopItem/player- profileborder/프로필프레임-평민.png": "8c2d2027440920b30a71ae86db54f526c3b47c84",
  "/shopItem/player- profileborder/프로필프레임-경비원.png": "705c0028ec4455d9ed8066769f41b4e65bee48ae",
  "/shopItem/player- profileborder/프로필프레임-마녀사냥꾼.png": "a8857bf262221bbc68f8e221c1cbcd45bccdf8b6",
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

test("F-18 AC-06: podium 도메인 소스 17개가 삭제·이름 변경·내용 변경 없이 그대로 보존되어 있다", () => {
  for (const [relativePath, expectedSha1] of Object.entries(PODIUM_SOURCE_BASELINE)) {
    const absolutePath = join(srcDir, relativePath)

    let bytes
    try {
      bytes = readFileSync(absolutePath)
    } catch {
      assert.fail(`podium 소스가 사라졌거나 이름이 바뀌었습니다: ${relativePath}`)
    }

    assert.ok(bytes.length > 0, `podium 소스가 비어 있습니다: ${relativePath}`)
    assert.equal(gitBlobSha1(bytes), expectedSha1, `podium 소스 내용이 바뀌었습니다: ${relativePath}`)
  }
})

test("F-18 AC-06: 명예의 전당이 쓰는 이미지 36개가 실제 파일로 해석되고 바이트까지 보존되어 있다", async () => {
  const { PODIUM_ASSETS } = await import("../../domains/podium/constants/podiumAssets.js")
  const { PODIUM_RANKING_DUMMY } = await import("../../domains/podium/content/podiumRankingDummy.js")
  const { LOBBY_MENU_BUTTONS } = await import("../../domains/lobby/constants/lobbyAssets.js")
  const { publicAsset } = await import("../../shared/utils/publicAsset.js")

  // production과 **같은** 정규화 경로(publicAsset: NFC + encodeURI)로 실제 요청 경로를
  // 만든다. 상수 문자열 자체는 NFD라 그대로 파일 경로로 쓰면 ENOENT가 난다.
  const declared = [
    PODIUM_ASSETS.background,
    PODIUM_ASSETS.headerPlate,
    PODIUM_ASSETS.rankingTableFrame,
    PODIUM_ASSETS.rankFrames[1],
    PODIUM_ASSETS.rankFrames[2],
    PODIUM_ASSETS.rankFrames[3],
    PODIUM_ASSETS.pageArrow,
    ...PODIUM_RANKING_DUMMY.flatMap((entry) => [entry.profileSrc, entry.profileBorderSrc]),
    LOBBY_MENU_BUTTONS.hallOfFame,
  ]

  const resolved = new Set(declared.map((src) => decodeURI(publicAsset(src)).normalize("NFC")))
  const baselineKeys = new Set(Object.keys(PODIUM_ASSET_BASELINE).map((key) => key.normalize("NFC")))

  // 상수에서 항목을 지워 검사 대상을 함께 줄이는 우회를 막는다 — 기준 목록과 **정확히**
  // 같은 집합이어야 한다.
  assert.equal(resolved.size, 36, "현재 상수가 선언하는 고유 에셋 수가 기준(36)과 다릅니다.")
  for (const key of baselineKeys) {
    assert.ok(resolved.has(key), `기준 에셋이 더 이상 선언되지 않습니다: ${key}`)
  }
  for (const key of resolved) {
    assert.ok(baselineKeys.has(key), `기준 목록에 없는 에셋이 선언되었습니다: ${key}`)
  }

  for (const [rawKey, expectedSha1] of Object.entries(PODIUM_ASSET_BASELINE)) {
    const key = rawKey.normalize("NFC")
    const absolutePath = join(publicDir, key)

    let bytes
    try {
      bytes = readFileSync(absolutePath)
    } catch {
      assert.fail(`에셋 파일이 사라졌거나 이름이 바뀌었습니다: ${key}`)
    }

    assert.ok(bytes.length > 0, `에셋 파일이 비어 있습니다: ${key}`)
    assert.ok(
      bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE),
      `PNG 시그니처가 깨졌습니다(이미지 손상): ${key}`,
    )
    assert.equal(gitBlobSha1(bytes), expectedSha1, `에셋 바이트가 바뀌었습니다: ${key}`)
  }
})
