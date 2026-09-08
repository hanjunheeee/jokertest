# UI-05 설정 화면 이식 — 시각 확인 기록

- 상태: **미검증** (파이프라인 실행 환경에서 브라우저를 띄우지 못함)
- 대상: 설정 화면 일반/사운드 탭 전환, 일반 탭 체크박스(전체화면 전환·친구 초대·게임 초대·귓속말·
  시스템 알림)·텍스트 크기 슬라이더·튜토리얼 다시 보기·설정 초기화 버튼, 사운드 탭 볼륨 슬라이더
  3종(Master/배경음/효과음)
- 코드 검증 결과 (사람 검토, 2026-09-08):
  - 원격 `origin/feature/ui-Phase1complete`의 `domains/settings` 관련 파일을 `git show`로 직접
    받아 대조했다. `GeneralSettingsTab.jsx`·`SettingContentArea.jsx`·`SettingPanel.jsx`·
    `SettingTabs.jsx`·`generalSettings.js`·`settingAssets.js`·`settingTabs.js`는 원격과 동일한
    구조로 이식했고, `SettingPage.jsx`는 이미 원격과 바이트 단위로 동일했다.
  - 사운드 탭은 원격 UI를 그대로 옮기되, 값 보관을 컴포넌트 내부 `useState`에서
    `hooks/useSoundSettings.js`로 추출했다(AC-03/AC-04 요구사항). 렌더 결과와 props 흐름은
    원격과 동일하다.
  - `GeneralSettingsTab.jsx`가 참조하는 자산(`SETTING_ASSETS.actionButton` 등)과
    `SettingAssets.bgVideo`가 가리키는 `로비 설정창 영상2.mp4`가 `frontend/public`에 실제로
    존재함을 확인했다.
  - `useFullscreen.js`의 실제 export가 `isFullscreen`/`setFullscreen`임을 확인하고
    `GeneralSettingsTab.jsx`가 이를 그대로 사용하도록 이식했다.
  - frontend 테스트·build는 이 워크트리에 `node_modules`가 없어 실행하지 못했다(`.pluto/progress.md`
    참고). 상수 테스트(`settingConstants.test.js`)만 node 내장 테스트 러너로 통과를 확인했다.
- 실제 브라우저 탭 전환·슬라이더 조작 확인은 UI-16(전체 흐름 실제 브라우저 회귀 검증)에서 수행한다.
