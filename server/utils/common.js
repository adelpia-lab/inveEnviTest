/**
 * 공통 유틸리티 함수들
 * 여러 파일에서 중복 사용되는 함수들을 모아놓은 파일
 */

/**
 * 지정된 시간(밀리초)만큼 대기하는 함수
 * @param {number} ms - 대기할 시간 (밀리초)
 * @returns {Promise} - 대기 완료를 알리는 Promise
 */
export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 현재 날짜와 시간을 포맷된 문자열로 반환 (Windows 파일명 안전)
 * @returns {string} - 포맷된 날짜 시간 문자열
 */
export function getFormattedDateTime() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  
  // Windows에서 안전한 파일명을 위해 콜론을 하이픈으로 변경
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`;
}

/**
 * 현재 날짜를 디렉토리명으로 사용할 수 있는 형식으로 반환
 * @returns {string} - YYYYMMDD_HHMM 형식의 문자열
 */
export function getDateDirectoryName() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  
  return `${year}${month}${day}_${hours}${minutes}`;
}

/**
 * 현재 시간을 밀리초로 반환
 * @returns {number} - 현재 시간 (밀리초)
 */
export function Now() {
  return Date.now();
}

/**
 * 전압 값을 소수점 둘째 자리까지 반올림
 * @param {number} voltageValue - 반올림할 전압 값
 * @returns {number} - 반올림된 전압 값
 */
export function truncateVoltageToTwoDecimals(voltageValue) {
  if (typeof voltageValue !== 'number' || isNaN(voltageValue)) {
    return 0;
  }
  return Math.round(voltageValue * 100) / 100;
}

/**
 * 읽은 전압과 예상 전압을 비교하여 허용 오차 내에 있는지 확인
 * @param {number} readVoltage - 읽은 전압 값
 * @param {number} expectedVoltage - 예상 전압 값
 * @param {number} tolerance - 허용 오차 (기본값: 0.1V)
 * @returns {boolean} - 허용 오차 내에 있으면 true, 아니면 false
 */
export function compareVoltage(readVoltage, expectedVoltage, tolerance = 0.1) {
  if (typeof readVoltage !== 'number' || typeof expectedVoltage !== 'number') {
    return false;
  }
  
  const difference = Math.abs(readVoltage - expectedVoltage);
  return difference <= tolerance;
}
