// 10분이 지났는 데도 온도가 하강 하지 않는다==> 온도 하강 에러
//  TEMP_DOWN_TIME 이 지나도 -30 이하가 되지 않으면 에러 처리 함

const TEMP_DOWN_TIME = 10;
const TEMP_CHECK_INTERVAL = 5 * 60 * 1000; // 5분을 밀리초로 변환
const MIN_TEMP_DROP = 3; // 최소 온도 하강 기준 (도)
const MAX_TEMP_DOWN_TIME = 2 * 60 * 60 * 1000; // 2시간을 밀리초로 변환

export async function TemperatureDown() {
    let dataTemperNow = 0;
    let dataTemperOld = 0;
    let checkCount = 0;
    const startTime = Date.now(); // 시작 시간 기록
    
    // 초기 온도 읽기
    dataTemperNow = dataTemperOld = await ReadChamber();
    console.log(`[TemperatureDown] 초기 온도: ${dataTemperNow}°C`);

/*    // 초기 온도가 목표 범위에 있는지 확인
    if (dataTemperNow > 30 || dataTemperNow < 25) {
        console.log(`[TemperatureDown] 초기 온도가 목표 범위를 벗어남: ${dataTemperNow}°C`);
        return false;
    }
*/
    // 온도 하강 모니터링 시작
    while (dataTemperNow > -30) {
        // 5분 대기
        await sleep(TEMP_CHECK_INTERVAL);
        checkCount++;
        
        // 현재 온도 읽기
        dataTemperNow = await ReadChamber();
        console.log(`[TemperatureDown] ${checkCount}번째 체크 - 현재 온도: ${dataTemperNow}°C`);
        
        // 온도 하강량 계산
        const tempDrop = dataTemperOld - dataTemperNow;
        console.log(`[TemperatureDown] 온도 하강량: ${tempDrop}°C (이전: ${dataTemperOld}°C, 현재: ${dataTemperNow}°C)`);
        
        // 3도 이상 하강하지 않았으면 에러 반환
        if (tempDrop < MIN_TEMP_DROP) {
            console.error(`[TemperatureDown] 온도 하강 에러: 5분 동안 ${MIN_TEMP_DROP}°C 이상 하강하지 않음 (하강량: ${tempDrop}°C)`);
            return { error: `온도 하강 에러: 5분 동안 ${MIN_TEMP_DROP}°C 이상 하강하지 않음 (하강량: ${tempDrop}°C)` };
        }
        
        // 목표 온도에 도달했는지 확인
        if (dataTemperNow <= -30) {
            console.log(`[TemperatureDown] 목표 온도 도달: ${dataTemperNow}°C`);
            const dataVolt = await GetData();
            return dataVolt;
        }
        
        // 이전 온도 업데이트
        dataTemperOld = dataTemperNow;
    }
    
    // 목표 온도에 도달하지 못한 경우
    console.error(`[TemperatureDown] 목표 온도(-30°C)에 도달하지 못함. 최종 온도: ${dataTemperNow}°C`);
    return { error: `목표 온도(-30°C)에 도달하지 못함. 최종 온도: ${dataTemperNow}°C` };
}

