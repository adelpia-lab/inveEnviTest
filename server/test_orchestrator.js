/**
 * 테스트 프로세스 오케스트레이터 테스트 파일
 * 새로운 오케스트레이터 함수들의 사용법을 보여줍니다.
 */

import { 
  runTestProcessWithResultHandling, 
  processTestResultAndGenerateReport 
} from './RunTestProcess.js';

/**
 * 테스트 프로세스 실행 예제
 */
async function testRunTestProcess() {
  try {
    console.log('🚀 테스트 프로세스 실행 시작...');
    
    // 테스트 옵션 설정
    const testOptions = {
      // 필요한 테스트 옵션들을 여기에 설정
    };
    
    // 새로운 오케스트레이터 함수를 사용하여 테스트 실행
    const result = await runTestProcessWithResultHandling(testOptions);
    
    console.log('📊 테스트 결과:', result);
    
    if (result.success) {
      console.log(`✅ 테스트 완료: ${result.reportType}`);
      console.log(`📄 리포트 파일: ${result.reportResult.filename}`);
    } else {
      console.error(`❌ 테스트 실패: ${result.error}`);
    }
    
  } catch (error) {
    console.error('❌ 테스트 실행 중 오류:', error.message);
  }
}

/**
 * 기존 테스트 결과를 처리하는 예제
 */
async function testProcessExistingResult() {
  try {
    console.log('🔄 기존 테스트 결과 처리 시작...');
    
    // 가상의 테스트 결과 (실제로는 runNextTankEnviTestProcess의 리턴 값)
    const mockTestResult = {
      status: 'stopped',
      message: '사용자에 의해 중단됨',
      stoppedAtCycle: 3,
      stoppedAtPhase: 'high_temp_test',
      stopReason: 'user_stop',
      totalCycles: 5
    };
    
    // 디렉토리명 설정
    const directoryName = 'test_directory_2024';
    
    // 결과 처리 및 리포트 생성
    const result = await processTestResultAndGenerateReport(mockTestResult, directoryName);
    
    console.log('📊 처리 결과:', result);
    
    if (result.success) {
      console.log(`✅ 처리 완료: ${result.reportType}`);
      console.log(`📄 리포트 파일: ${result.reportResult.filename}`);
    } else {
      console.error(`❌ 처리 실패: ${result.error}`);
    }
    
  } catch (error) {
    console.error('❌ 결과 처리 중 오류:', error.message);
  }
}

/**
 * 다양한 테스트 결과 상태에 대한 처리 예제
 */
async function testVariousStatuses() {
  try {
    console.log('🔄 다양한 상태 테스트 시작...');
    
    const testCases = [
      {
        name: '정상 완료',
        result: {
          status: 'completed',
          message: '모든 사이클 완료',
          totalCycles: 5,
          finalReportGenerated: true
        }
      },
      {
        name: '사용자 중단',
        result: {
          status: 'stopped',
          message: '사용자에 의해 중단됨',
          stoppedAtCycle: 2,
          stoppedAtPhase: 'high_temp_test',
          stopReason: 'user_stop',
          totalCycles: 5
        }
      },
      {
        name: '시스템 에러',
        result: {
          status: 'error',
          message: '시스템 오류 발생',
          errorType: 'system_error',
          totalCycles: 5
        }
      }
    ];
    
    for (const testCase of testCases) {
      console.log(`\n📋 테스트 케이스: ${testCase.name}`);
      const result = await processTestResultAndGenerateReport(testCase.result, 'test_directory');
      console.log(`결과: ${result.success ? '✅ 성공' : '❌ 실패'} - ${result.reportType}`);
    }
    
  } catch (error) {
    console.error('❌ 다양한 상태 테스트 중 오류:', error.message);
  }
}

// 메인 실행 함수
async function main() {
  console.log('🎯 테스트 프로세스 오케스트레이터 테스트 시작\n');
  
  // 1. 기존 테스트 결과 처리 테스트
  await testProcessExistingResult();
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // 2. 다양한 상태 테스트
  await testVariousStatuses();
  
  console.log('\n' + '='.repeat(50) + '\n');
  
  // 3. 실제 테스트 프로세스 실행 (주석 처리 - 실제 환경에서만 실행)
  // await testRunTestProcess();
  
  console.log('\n🎯 모든 테스트 완료');
}

// 스크립트가 직접 실행될 때만 main 함수 실행
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export {
  testRunTestProcess,
  testProcessExistingResult,
  testVariousStatuses
};
