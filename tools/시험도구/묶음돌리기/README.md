# 묶음 돌리기

브라우저 시험(Playwright)을 덩어리로 나눠 돌리는 스크립트 모음임. 시험 서버를 한 번 켜 두고 덩어리마다 다시 씀.

- 시험 백엔드 4100 (시험 DB `joker_e2e`) · PC 화면 5273 · 모바일 화면 5274 · 관리자 화면 5275 — 화면은 빌드본 모드
- 기록(log·json·CPU 기록·PID)은 `tools/시험도구/.run/묶음돌리기/` 에 남음 (git 에 안 올라감)
- 저장소 어디서 불러도 됨 (스크립트 자리 기준으로 경로를 찾음). 아래 명령은 저장소 맨 위에서 친 것

## 1. 서버 켜기

```powershell
powershell -ExecutionPolicy Bypass -File tools/시험도구/묶음돌리기/start-servers.ps1
# 관리자 화면도: -Apps backend,desktop,mobile,admin,mon
```

- 하나씩 켜고 포트가 열릴 때까지 기다림 (처음 빌드면 몇 분). 이미 열린 포트는 건너뜀
- `mon` = CPU·메모리를 30초마다 `mon.csv` 에 적는 기록기 (모바일 전체가 일꾼 수 고를 때 씀)
- 켠 PID 는 `pids.txt` 에 적음 → 끌 때 이것만 끔

## 2. 한 덩어리 돌리기

```bash
bash tools/시험도구/묶음돌리기/run.sh <이름> <일꾼 수> [playwright 인자...]
# 예: 모바일 5명 한 판
bash tools/시험도구/묶음돌리기/run.sh m-a07full 1 --project=mobile tests/mobile/a07-full-game.spec.js
```

- 시작 전 CPU 85% 아래·남은 메모리 4GB 위가 될 때까지 기다림 (`waitcpu.ps1`, 최대 10분)
- 끝나면 통과·실패 숫자와 실패 줄만 보여 줌. 전부는 `<이름>.log`, 결과는 `<이름>.json`
- 실패 사진·trace 는 `e2e/test-results/b-<이름>/`
- 안 켜 둔 화면 서버(예: PC 5273·관리자 5275)는 Playwright 가 그 덩어리 동안만 켰다 끔 (`E2E_REUSE=1`)
- 서버를 막 켠 뒤 첫 덩어리는 첫 화면 열기가 30초를 넘겨 하나쯤 실패할 수 있음 → 실패만 다시 돌려 봄

## 3. 모바일 전체

```bash
bash tools/시험도구/묶음돌리기/run-mobile.sh m1-
```

- 앞 번호별 덩어리 7개를 차례로 돌림 (a01 · a02a03 · a04 · …)
- 덩어리마다 일꾼 수: 최근 5분에 CPU 85% 넘은 때가 3번 이상이거나 메모리 2GB 아래면 1, 아니면 2 (`mon.csv` 가 없으면 1)

## 4. 실패만 다시

```bash
cd tools/시험도구/.run/묶음돌리기
node ../../묶음돌리기/failed.js m1-a01.json m1-a04.json            # 실패한 "파일:줄" (같은 시험은 뒤에 준 파일 결과가 이김 → 다시 돌린 json 을 뒤에 줌)
node ../../묶음돌리기/failed.js --titles m1-*.json                  # 제목만
# 시험 번호로 다시 돌리기
bash ../../묶음돌리기/run.sh m1-again 1 --project=mobile --grep "$(node ../../묶음돌리기/failed.js --grep m1-*.json)"
```

## 5. 끄기

```powershell
powershell -ExecutionPolicy Bypass -File tools/시험도구/묶음돌리기/stop-servers.ps1
```

- `pids.txt` 의 PID 와 그 자식만 끔 (남이 켠 서버는 안 건드림), 끈 뒤 4100·5273·5274·5275 가 비었는지 보여 줌

## 알아 둘 것

- 쿠폰 단추: 화면 빌드 값 `VITE_STORE_COUPON_BUTTON=1` 이면 보임 (평소 빌드는 숨김). e2e 빌드(`e2e/scripts/serve-front.js`)는 PC·모바일에 자동으로 1 을 넣음 → 따로 안 줘도 됨
- CPU 규칙: 일꾼은 2까지 (`run.sh` 가 2 넘게 주면 2로 줄임). CPU 85% 넘거나 남은 메모리 4GB 아래면 기다렸다 시작
- 화면 코드를 고쳤으면: `E2E_FRONT_REBUILD=0` 이라도 빌드본이 낡았으면 서버 켤 때 다시 빌드함 → 서버를 끄고 다시 켬
