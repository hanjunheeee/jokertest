# frontend-mobile UI 스크린샷 체크리스트

로비·마이페이지·상점·서고 등 **주요 화면 + 주요 모달**만 대상.  
**제외:** `/ingame`, `/gameresult`, 인게임 오버레이·시트 전부.

## 촬영 전제

| 항목 | 권장 |
|------|------|
| 뷰포트 | 세로 390×844 (또는 실제 타깃 기기) |
| 로그인 | 테스트 계정으로 `ProtectedRoute` 통과 |
| 로비 | 인트로 영상 끝난 뒤(UI 노출) 또는 스킵 |
| 상점·설정 | 입장 영상 `introDone` 이후 |
| 파일명 | `영역__화면-id.png` (예: `lobby__main.png`) |

---

## 1. 인증 (비로그인)

| ID | 경로 / 진입 | 캡처 내용 | 비고 |
|----|-------------|-----------|------|
| auth-login | `/login` | 로그인 폼 | 기본 |
| auth-signup | `/login` → 회원가입 전환 | 일반 가입 폼 | |
| auth-signup-verify | 가입 중 | 이메일 인증 코드 줄 노출 시 | 조건부 |
| auth-social-signup | URL에 소셜 가입 intent | `SocialSignupForm` | 계정·환경 필요 |
| auth-find-id | `/find-id` | 아이디 찾기 | |
| auth-pw-request | `/password-reset/request` | 비밀번호 재설정 요청 | |
| auth-pw-reset | `/password-reset` | 재설정 폼(토큰 필요) | 링크/토큰 필요 |

---

## 2. 로비

| ID | 경로 / 진입 | 캡처 내용 | 비고 |
|----|-------------|-----------|------|
| lobby-main | `/lobby` | 메뉴·프로필·바닥 줄 | UI visible |
| lobby-notifications | 바닥 알림 | `NotificationSheet` | |
| lobby-friends-list | 바닥 친구 | `FriendsSheet` 탭 **친구 목록** | |
| lobby-friends-add | 친구 시트 | 탭 **친구 추가** | |
| lobby-friends-accept | 친구 시트 | 탭 **요청 수락** | |
| lobby-friends-invite | 친구 시트 | 탭 **게임 초대** | |
| lobby-friends-block | 친구 시트 | 탭 **차단 목록** | |

---

## 3. 마이페이지·계정

| ID | 경로 / 진입 | 캡처 내용 | 비고 |
|----|-------------|-----------|------|
| mypage-main | `/mypage` | 프로필·가면·피의 기록 | |
| mypage-profile-edit | `/mypage?sheet=profile-edit` | `ProfileEditSheet` (사진/테두리 탭 각 1장) | 탭 2 |
| mypage-wear | `/mypage?sheet=skin-card-wear` | `WearSheet` 스킨&카드 착용 | 직업 탭 1장 대표 |
| emoticon-page | `/mypage/emoticons` | 이모티콘 팔레트 본문 | |
| emoticon-save-done | 저장 후 | `SaveDoneDialog` | 1회 저장 동작 |
| account-main | `/account` | 계정 관리 화면 | |

---

## 4. 설정

| ID | 경로 / 진입 | 캡처 내용 | 비고 |
|----|-------------|-----------|------|
| setting-intro | `/setting` | 입장 영상 재생 중 | 선택 |
| setting-general | `/setting` (인트로 후) | 탭 **일반** 목록 | |
| setting-sound | `/setting` | 탭 **사운드** 목록 | |
| setting-tutorial | 일반 탭 → 튜토리얼 다시 보기 | `TutorialSheet` (1슬라이드 대표) | |

---

## 5. 상점

| ID | 경로 / 진입 | 캡처 내용 | 비고 |
|----|-------------|-----------|------|
| store-main | `/store` (인트로 후) | 카테고리 + 그리드 1장 | |
| store-cat-skin | 카테고리 **스킨** | | |
| store-cat-card | **플레이어 카드** | | |
| store-cat-border | **프로필 테두리** | | |
| store-cat-currency | **인게임 재화** | | |
| store-cat-emoticon | **이모티콘** | | |
| store-skin-zoom | 스킨 확대 | `SkinZoomModal` | 아이템 탭 |
| store-border-zoom | 테두리 확대 | `BorderZoomModal` | |
| store-bulk | 일괄구매 열기 | `BulkModal` | 선택 후 진입 |

---

## 6. 기억의 서고

| ID | 경로 / 진입 | 캡처 내용 | 비고 |
|----|-------------|-----------|------|
| library-forbidden | `/library` 책갈피 **금지된 기록** | 목차 + 해금/본문 스크롤(대표 1쪽) | |
| library-guests | 책갈피 **초대받은 자들** | 직업 탭 1개(전적+도전과제) | 5직업 중 1~2장 샘플 |
| library-sound | 상단 | `SoundControl` 노출만 | 본문에 포함 가능 |

---

## 7. 게임플레이 흐름 (인게임·결과 제외)

로비 **게임플레이** 이후 ~ **대기방**까지. `/ingame`, `/gameresult`는 촬영 안 함.

| ID | 경로 / 진입 | 캡처 내용 | 비고 |
|----|-------------|-----------|------|
| gamemode-main | `/gameMode` | 모드 카드 목록 | |
| gamemode-search | 빠른 매칭 시작 | `SearchOverlay` | |
| multiplay-main | `/multiplay` | 멀티 플레이 목록/진입 | |
| room-invite-main | `/roomInvite` | 비밀연회장 초대 코드 | |
| game-setup-main | `/game-setup` | 방 설정 패널 | 방 만들기 전 |
| matching-main | `/game-matching` | 대기방 보드 | 테스트 방 필요 |
| matching-room-code | 대기방 | `RoomCodeSheet` | |
| matching-friend-invite | 대기방 | `FriendInviteSheet` | |
| matching-settings | 방장 | `SettingsEditSheet` | 방장 권한 |
| matching-kick | 방장 | `KickSheet` | |
| matching-start-blocked | 시작 불가 시 | `StartBlockedSheet` | 조건 맞출 때 |

---

## 8. 공통·기타

| ID | 내용 | 비고 |
|----|------|------|
| global-parchment-alert | 전역 양피지 알림 | 트리거 있는 액션 1회 |
| library-challenge-border-zoom | 서고 도전과제 | 테두리 보상 `BorderZoomModal` | 초대받은 자들 |

---

## 9. 의도적 제외

- `/ingame` 및 인게임 `Overlay` / `SettingsSheet` / `RecordSheet` / 채팅 시트 등
- `/gameresult`
- `/dev/tribunal-presentation` (DEV 전용)
- 로비 메뉴 **종료**·**고객센터**(외부 링크)
- 소셜 로그인 버튼만 있는 중간 상태(필요 시 auth 섹션에 추가)

---

## 예상 장수 (대표만)

| 구분 | 약 |
|------|-----|
| 라우트 풀페이지 | ~25 |
| 모달·시트·탭 분기 | ~25 |
| **합계** | **~50장** (샘플·조건부 제외 시 35~40) |

---

## 산출물 (자동)

| 경로 | 설명 |
|------|------|
| `docs/screenshots/png/*.png` | 캡처 원본 |
| `docs/screenshots/gallery.html` | **10장×1페이지** 격자 (인쇄→PDF 가능) |

```powershell
# dev:mobile 켠 상태, 로그인 테스트 계정 환경변수
$env:SCREENSHOT_EMAIL="your@email"
$env:SCREENSHOT_PASSWORD="***"
# 인증 배경 영상이 검정이면:
$env:SCREENSHOT_HEADED="1"
$env:SCREENSHOT_AUTH_VIDEO_SEEK="5"
npm run screenshots --prefix frontend-mobile
```

`gallery.html`을 브라우저로 열고 **인쇄 → PDF 저장**하면 페이지 단위 PDF도 됩니다.

이 문서를 기준으로 캡처 시 `ID` 열을 파일명 접두사로 쓰면 정리하기 쉽습니다.
