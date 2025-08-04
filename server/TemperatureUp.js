// 10분이 지났는 데도 온도가 하강 하지 않는다==> 온도 하강 에러
//  TEMP_UP_TIME 이 지나도 70 이상이 되지 않으면 에러 처리 함

const TEMP_UP_TIME = 70; // 분 단위(참고용)
const TEMP_CHECK_INTERVAL = 5 * 60 * 1000; // 5분을 밀리초로 변환
const MIN_TEMP_RISE = 3; // 최소 온도 상승 기준 (도)
const MAX_TEMP_UP_TIME = 70 * 60 * 1000; // 70분을 밀리초로 변환

export async function TemperatureUp() {
    let dataTemperNow = 0;
    let dataTemperOld = 0;
    let checkCount = 0;
    const startTime = Date.now(); // 시작 시간 기록
    
    // 초기 온도 읽기
    dataTemperNow = dataTemperOld = await ReadChamber();
    console.log(`[TemperatureUp] 초기 온도: ${dataTemperNow}°C`);

    // 온도 상승 모니터링 시작
    while (dataTemperNow < 70) {
        // 5분 대기
        await sleep(TEMP_CHECK_INTERVAL);
        checkCount++;

        // 현재 온도 읽기
        dataTemperNow = await ReadChamber();
        console.log(`[TemperatureUp] ${checkCount}번째 체크 - 현재 온도: ${dataTemperNow}°C`);

        // 온도 상승량 계산
        const tempRise = dataTemperNow - dataTemperOld;
        console.log(`[TemperatureUp] 온도 상승량: ${tempRise}°C (이전: ${dataTemperOld}°C, 현재: ${dataTemperNow}°C)`);

        // 3도 이상 상승하지 않았으면 에러 반환
        if (tempRise < MIN_TEMP_RISE) {
            console.error(`[TemperatureUp] 온도 상승 에러: 5분 동안 ${MIN_TEMP_RISE}°C 이상 상승하지 않음 (상승량: ${tempRise}°C)`);
            return { error: `온도 상승 에러: 5분 동안 ${MIN_TEMP_RISE}°C 이상 상승하지 않음 (상승량: ${tempRise}°C)` };
        }

        // 최대 허용 시간 초과 시 에러
        if (Date.now() - startTime > MAX_TEMP_UP_TIME) {
            console.error(`[TemperatureUp] 최대 허용 시간(70분) 초과. 현재 온도: ${dataTemperNow}°C`);
            return { error: `최대 허용 시간(70분) 초과. 현재 온도: ${dataTemperNow}°C` };
        }

        // 목표 온도에 도달했는지 확인
        if (dataTemperNow >= 70) {
            console.log(`[TemperatureUp] 목표 온도 도달: ${dataTemperNow}°C`);
            const dataVolt = await GetData();
            return dataVolt;
        }

        // 이전 온도 업데이트
        dataTemperOld = dataTemperNow;
    }

    // 목표 온도에 도달하지 못한 경우
    console.error(`[TemperatureUp] 목표 온도(70°C)에 도달하지 못함. 최종 온도: ${dataTemperNow}°C`);
    return { error: `목표 온도(70°C)에 도달하지 못함. 최종 온도: ${dataTemperNow}°C` };
}

