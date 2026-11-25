#!/usr/bin/env bash
# 모바일 묶음을 앞 번호별로 나눠 차례대로, 사용: run-mobile.sh <앞이름표>
# 덩어리마다 일꾼 수: 최근 5분(mon.csv 10칸) 중 CPU 85% 넘은 칸이 3개 이상이거나 남은 메모리 2GB 아래면 1, 아니면 2 (mon.csv 없으면 1)
HERE="$(cd "$(dirname "$0")" && pwd)"
B="$HERE/../.run/묶음돌리기"
mkdir -p "$B"
tag=$1; shift
pick() {
    if [ ! -s "$B/mon.csv" ]; then echo 1; return; fi
    tail -10 "$B/mon.csv" | awk -F, '$2>85{n++} $3<2{m++} END{print (n>=3||m>0)?1:2}'
}
part() { name=$1; shift; w=$(pick); bash "$HERE/run.sh" "$tag$name" "$w" --project=mobile "$@"; }
part a01 tests/mobile/a01-
part a02a03 tests/mobile/a02- tests/mobile/a03-
part a04 tests/mobile/a04-
part a05a06 tests/mobile/a05- tests/mobile/a06-
part a07a08 tests/mobile/a07- tests/mobile/a08-
part a09a10 tests/mobile/a09- tests/mobile/a10-
part rest tests/mobile/a11- tests/mobile/a12- tests/mobile/a13- tests/mobile/a15- tests/mobile/a18-
echo "MOBILEDONE $tag" >> "$B/parts.txt"
