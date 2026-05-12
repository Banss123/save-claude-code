// ============================================
// 메타 리드 자동화 스크립트 v2.2 (2026-05-06 갱신)
// 원본 탭 → 디비관리 탭 자동 정리 + 디스코드 알림
//
// v2 (2026-04-30):
//   1) 디스코드 실패 시 처리완료 표시 X (다음 사이클 재시도)
//   2) 재시도 5회 + 지수 백오프 + 429 rate limit 대응
//   3) 한 사이클당 처리 건수/시간 한도 (timeout 방지)
//   4) processedIds 한도 제거 — 디비관리 탭 L열을 단일 진실 소스로 사용
//   5) 5사이클 누적 실패 시 강제 처리완료 + @here 영구 실패 알림
//   6) 마이그레이션 함수 추가 (migrateToV2)
//
// v2.1 (2026-05-01) — 누락 방지 보강:
//   7) 스키마 가드 — 매 사이클 SRC/DEST 헤더 검증, 어긋나면 즉시 중단 + 알림
//   8) 일일 헬스체크 — 매일 09시 처리 카운트/미처리/24h 무활동 리포트
//   9) 누락 탐지·일괄 발송 함수 — findMissingLeads / sendMissingByRows
//
// v2.2 (2026-05-06) — 운영 알림 채널 분리:
//   10) OPS_WEBHOOK 추가 (KPI 채널과 동일) — 헬스체크/스키마 알림은 운영 채널로
//   11) 디비 알림 채널은 신규 리드 + 영구 실패만 유지 (영업팀이 봐야 하는 것)
//
// 최초 1회 실행 필요:
//   - setupTrigger()             1분 트리거
//   - setupDailyHealthCheck()    매일 09시 헬스체크 트리거
//   - migrateToV2()              v1→v2 마이그레이션 (이미 완료된 경우 재실행 금지)
// ============================================

const CONFIG = {
  SOURCE_TAB: '260324 병의원&뷰티',
  DEST_TAB: '디비관리(병의원&뷰티)',
  DISCORD_WEBHOOK: 'https://discord.com/api/webhooks/1486278144725094471/8G-awR-8wJaRujtwp1TulQiDecaJ90RGO-ioQnlsNjensasqb4qm9P59kNi52X7dFldX', // #리드알림 — 신규 리드 + 영구 실패 (영업팀 필독)
  OPS_WEBHOOK:     'https://discord.com/api/webhooks/1486341655392157786/z8o9KxR11Tb33kain3vVyNMxKJu5u5lzcvzR0RX_yg-aZzjId1M_gl2Y_cksjsKfAJeg', // #KPI/운영 — 헬스체크 + 스키마 변경 (시스템 모니터링)
  MAX_RETRIES: 5,             // 디스코드 재시도 횟수 (1회 호출당)
  MAX_PER_RUN: 50,            // 한 사이클 최대 처리 건수
  MAX_FAILURE_CYCLES: 5,      // 한 ID당 최대 재시도 사이클
  MAX_RUN_MS: 4 * 60 * 1000,  // 한 사이클 최대 실행 시간 (4분, GAS 6분 timeout 대비 안전 마진)
};

// 원본 탭 열 인덱스 (0부터 시작)
const SRC = {
  ID: 0,
  CREATED_TIME: 1,
  AD_NAME: 3,
  BUSINESS_TYPE: 12,
  MARKETING_HISTORY: 13,
  STORE_NAME: 14,
  CALL_TIME: 15,
  FULL_NAME: 16,
  PHONE: 17,
};

// 디비관리 탭의 "리드ID" 컬럼 위치 (L열 = 0-indexed 11)
// I=상태(메모), J=현재상태, K=결과 드롭다운은 운영용이라 건드리지 않음
const DEST_ID_COL = 11;

// ============================================
// 메인 함수: 1분 트리거로 실행
// ============================================
function processNewLeads() {
  const startTime = Date.now();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const srcSheet = ss.getSheetByName(CONFIG.SOURCE_TAB);
  const destSheet = ss.getSheetByName(CONFIG.DEST_TAB);

  if (!srcSheet || !destSheet) {
    Logger.log('시트를 찾을 수 없습니다. 탭 이름을 확인하세요.');
    sendSchemaAlert(['SOURCE_TAB 또는 DEST_TAB 이름이 변경됨 (시트 미발견)']);
    return;
  }

  // 스키마 가드 — 컬럼 위치가 어긋나면 잘못된 데이터로 알림 발송 위험 → 즉시 중단
  const schemaErrors = validateSchema(srcSheet, destSheet);
  if (schemaErrors.length > 0) {
    Logger.log('스키마 불일치 ' + schemaErrors.length + '개. 처리 중단.');
    schemaErrors.forEach(function(e) { Logger.log('  - ' + e); });
    sendSchemaAlert(schemaErrors);
    return;
  }

  // 처리완료 ID 집합: 디비관리 탭 J열 + 마이그레이션 cutoff
  const processedFromSheet = getProcessedIdsFromDestSheet(destSheet);
  const migrationIds = getMigrationCutoffIds();
  const processedIds = new Set();
  processedFromSheet.forEach(id => processedIds.add(id));
  migrationIds.forEach(id => processedIds.add(id));

  const failureCounts = getFailureCounts();

  const srcData = srcSheet.getDataRange().getValues();
  if (srcData.length <= 1) return;

  let newCount = 0;
  let processedThisRun = 0;

  for (let i = 1; i < srcData.length; i++) {
    // 시간/건수 한도 체크 (timeout 방지)
    if (Date.now() - startTime > CONFIG.MAX_RUN_MS) {
      Logger.log('시간 한도 도달, 다음 사이클에서 계속');
      break;
    }
    if (processedThisRun >= CONFIG.MAX_PER_RUN) {
      Logger.log('건수 한도(' + CONFIG.MAX_PER_RUN + ') 도달, 다음 사이클에서 계속');
      break;
    }

    const row = srcData[i];
    const id = String(row[SRC.ID]).trim();
    if (!id || processedIds.has(id)) continue;

    const lead = {
      접수일시: formatDateTime(row[SRC.CREATED_TIME]),
      담당자: String(row[SRC.AD_NAME]).trim(),
      업장명: String(row[SRC.STORE_NAME]).trim(),
      업종: String(row[SRC.BUSINESS_TYPE]).trim(),
      이름: String(row[SRC.FULL_NAME]).trim(),
      전화번호: formatPhone(row[SRC.PHONE]),
      마케팅이력: String(row[SRC.MARKETING_HISTORY]).trim(),
      통화가능시간: String(row[SRC.CALL_TIME]).trim(),
    };

    const failCount = failureCounts[id] || 0;

    // 5사이클 누적 실패 → 강제 처리완료 + 영구 실패 알림
    if (failCount >= CONFIG.MAX_FAILURE_CYCLES) {
      Logger.log('[영구 실패] ' + id + ' | 강제 처리완료');
      sendFailureAlert(lead, id, '최종 실패 (' + failCount + '사이클 시도) — 수동 확인 필요');
      destSheet.appendRow([
        lead.접수일시, lead.담당자, lead.업장명, lead.업종,
        lead.이름, lead.전화번호, lead.마케팅이력, lead.통화가능시간, '', '', '', id,
      ]);
      processedIds.add(id);
      delete failureCounts[id];
      saveFailureCounts(failureCounts);
      processedThisRun++;
      continue;
    }

    // 디스코드 알림 시도 (성공해야 시트에 기록)
    const sent = sendDiscordNotification(lead);

    if (sent) {
      destSheet.appendRow([
        lead.접수일시, lead.담당자, lead.업장명, lead.업종,
        lead.이름, lead.전화번호, lead.마케팅이력, lead.통화가능시간, '', '', '', id,
      ]);
      processedIds.add(id);
      newCount++;
      processedThisRun++;
      // 마지막 처리 시각 기록 — 일일 헬스체크에서 24h 무활동 감지용
      PropertiesService.getScriptProperties().setProperty('lastLeadProcessedTime', String(Date.now()));
      // 실패 카운터 정리
      if (failureCounts[id] != null) {
        delete failureCounts[id];
        saveFailureCounts(failureCounts);
      }
    } else {
      // 알림 실패 → 시트 추가 X, 카운터 +1, 다음 사이클 재시도
      failureCounts[id] = failCount + 1;
      saveFailureCounts(failureCounts);
      Logger.log('[Discord 사이클 실패] ' + id + ' | 누적 ' + failureCounts[id] + '/' + CONFIG.MAX_FAILURE_CYCLES);
    }
  }

  if (newCount > 0) {
    Logger.log(newCount + '건 신규 처리 완료 (이 사이클)');
  }
}

// ============================================
// 처리완료 ID 추적 (디비관리 탭 J열 + 마이그레이션)
// ============================================
function getProcessedIdsFromDestSheet(destSheet) {
  const ids = new Set();
  const lastRow = destSheet.getLastRow();
  if (lastRow <= 1) return ids;
  const range = destSheet.getRange(2, DEST_ID_COL + 1, lastRow - 1, 1);
  const values = range.getValues();
  for (let i = 0; i < values.length; i++) {
    const id = String(values[i][0]).trim();
    if (id) ids.add(id);
  }
  return ids;
}

function getMigrationCutoffIds() {
  const props = PropertiesService.getScriptProperties();
  const chunks = parseInt(props.getProperty('migration_chunks') || '0');
  const ids = new Set();
  for (let i = 0; i < chunks; i++) {
    const chunk = JSON.parse(props.getProperty('migration_' + i) || '[]');
    chunk.forEach(id => ids.add(id));
  }
  return ids;
}

// ============================================
// 실패 카운터 (PropertiesService)
// ============================================
function getFailureCounts() {
  const stored = PropertiesService.getScriptProperties().getProperty('failureCounts');
  return stored ? JSON.parse(stored) : {};
}

function saveFailureCounts(counts) {
  PropertiesService.getScriptProperties().setProperty('failureCounts', JSON.stringify(counts));
}

// ============================================
// 디스코드 알림 (재시도 5회 + 지수 백오프 + 429 대응)
// ============================================
function sendDiscordNotification(lead) {
  const payload = {
    embeds: [{
      title: '새 리드 접수',
      color: 3447003,
      fields: [
        { name: '업장명', value: lead.업장명 || '-', inline: true },
        { name: '담당자', value: lead.담당자 || '-', inline: true },
        { name: '업종', value: lead.업종 || '-', inline: true },
        { name: '이름', value: lead.이름 || '-', inline: true },
        { name: '전화번호', value: lead.전화번호 || '-', inline: true },
        { name: '통화 가능 시간', value: lead.통화가능시간 || '-', inline: true },
        { name: '마케팅 이력', value: lead.마케팅이력 || '-', inline: false },
        { name: '접수 시간', value: lead.접수일시 || '-', inline: false },
      ],
    }],
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  for (let attempt = 1; attempt <= CONFIG.MAX_RETRIES; attempt++) {
    try {
      const response = UrlFetchApp.fetch(CONFIG.DISCORD_WEBHOOK, options);
      const code = response.getResponseCode();
      if (code === 204) return true;

      // 429 rate limit — 디스코드가 retry_after(초)로 알려줌
      if (code === 429) {
        try {
          const json = JSON.parse(response.getContentText());
          const retryAfter = (json.retry_after || 1) * 1000;
          Logger.log('[Discord] Rate limit ' + retryAfter + 'ms 대기');
          Utilities.sleep(retryAfter);
          continue; // 재시도 카운트 안 까임
        } catch (e) {
          // JSON 파싱 실패 시 일반 백오프로
        }
      }
      Logger.log('[Discord] 시도 ' + attempt + ' 실패 | 코드 ' + code + ' | ' + response.getContentText());
    } catch (e) {
      Logger.log('[Discord] 시도 ' + attempt + ' 에러: ' + e.message);
    }

    if (attempt < CONFIG.MAX_RETRIES) {
      Utilities.sleep(Math.pow(2, attempt) * 1000); // 2s, 4s, 8s, 16s
    }
  }
  return false;
}

// ============================================
// 영구 실패 알림 (@here + 빨간 임베드)
// ============================================
function sendFailureAlert(lead, id, reason) {
  const payload = {
    content: '@here ⚠ 리드 알림 영구 실패 — 수동 확인 필요',
    embeds: [{
      title: '리드 알림 실패: ' + (lead.업장명 || '-'),
      color: 15158332, // 빨강
      fields: [
        { name: 'ID', value: id || '-', inline: true },
        { name: '담당자', value: lead.담당자 || '-', inline: true },
        { name: '사유', value: reason, inline: false },
        { name: '이름', value: lead.이름 || '-', inline: true },
        { name: '전화번호', value: lead.전화번호 || '-', inline: true },
        { name: '업장명', value: lead.업장명 || '-', inline: true },
        { name: '접수 시간', value: lead.접수일시 || '-', inline: false },
      ],
    }],
  };
  try {
    UrlFetchApp.fetch(CONFIG.DISCORD_WEBHOOK, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
  } catch (e) {
    Logger.log('[Failure Alert] 자체도 전송 실패: ' + e.message);
  }
}

// ============================================
// 포맷터
// ============================================
function formatPhone(raw) {
  let phone = String(raw).trim();
  phone = phone.replace(/^p:/, '');
  if (phone.startsWith('+82')) phone = '0' + phone.substring(3);
  phone = phone.replace(/\D/g, '');
  if (phone.length === 11 && phone.startsWith('010')) {
    return phone.substring(0, 3) + '-' + phone.substring(3, 7) + '-' + phone.substring(7);
  }
  return phone;
}

function formatDateTime(raw) {
  try {
    const dt = new Date(raw);
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    const h = String(dt.getHours()).padStart(2, '0');
    const min = String(dt.getMinutes()).padStart(2, '0');
    return y + '-' + m + '-' + d + ' ' + h + ':' + min;
  } catch (e) {
    return String(raw);
  }
}

// ============================================
// 초기 설정 / 마이그레이션
// ============================================

/**
 * 1분 트리거 설정 (최초 1회 또는 트리거 재설정 시 실행)
 */
function setupTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'processNewLeads') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger('processNewLeads')
    .timeBased()
    .everyMinutes(1)
    .create();
  Logger.log('트리거 설정 완료: 1분마다 processNewLeads 실행');
}

/**
 * v1 → v2 마이그레이션 (1회만 실행)
 * 1) 디비관리 탭 J열 헤더 "리드ID" 추가
 * 2) 원본 탭의 현재 모든 ID를 cutoff로 기록 (이 시점 이전 = 처리완료 간주)
 * 3) v1 PropertiesService(processedIds) 정리
 *
 * 실행 방법: GAS 에디터 → 함수 선택 "migrateToV2" → 실행
 */
function migrateToV2() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const destSheet = ss.getSheetByName(CONFIG.DEST_TAB);
  const srcSheet = ss.getSheetByName(CONFIG.SOURCE_TAB);

  if (!srcSheet || !destSheet) {
    Logger.log('시트를 찾을 수 없습니다.');
    return;
  }

  // 1. 디비관리 탭 J열 헤더 추가
  destSheet.getRange(1, DEST_ID_COL + 1).setValue('리드ID');

  // 2. 원본 탭의 현재 모든 ID를 cutoff로 기록 (chunk 분할)
  const srcData = srcSheet.getDataRange().getValues();
  const ids = [];
  for (let i = 1; i < srcData.length; i++) {
    const id = String(srcData[i][SRC.ID]).trim();
    if (id) ids.push(id);
  }

  const props = PropertiesService.getScriptProperties();

  // 기존 migration chunk 정리
  const allKeys = props.getKeys();
  allKeys.forEach(k => {
    if (k.indexOf('migration_') === 0) props.deleteProperty(k);
  });

  const chunkSize = 200;
  let chunks = 0;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    props.setProperty('migration_' + chunks, JSON.stringify(chunk));
    chunks++;
  }
  props.setProperty('migration_chunks', String(chunks));

  // 3. v1 데이터 정리
  props.deleteProperty('processedIds');

  Logger.log('마이그레이션 완료 | 헤더 추가 + ' + ids.length + '건 cutoff (' + chunks + ' chunks)');
}

/**
 * 누적된 failureCounts 초기화 (필요 시 수동 실행)
 */
function clearFailureCounts() {
  PropertiesService.getScriptProperties().deleteProperty('failureCounts');
  Logger.log('failureCounts 초기화 완료');
}

// ============================================================================
// (2) 스키마 무결성 — SRC/DEST 컬럼 위치 검증 (2026-05-01 추가)
// ============================================================================
// 메타 양식 질문 추가/삭제 또는 디비관리 컬럼 삽입으로 인덱스가 어긋나면
// 잘못된 필드로 알림이 나가거나 ID 추적이 깨진다. 사이클마다 헤더 행을 검증하고
// 어긋나면 처리를 중단하고 영구 실패 알림을 보낸다.
// ============================================================================

const SCHEMA = {
  // 원본 탭 컬럼 인덱스 → 기대 헤더 텍스트 (SRC 상수와 일치해야 함)
  SRC_HEADERS: {
    0: 'id',
    1: 'created_time',
    3: 'ad_name',
    12: '현재_운영_중인_업종은_무엇인가요?',
    13: '현재_진행_중이거나,_과거에_했던_마케팅_내역을_적어주세요.',
    14: '매장_위치_및_상호명_(네이버_플레이스_기준)',
    15: '통화_가능한_시간대를_알려주세요',
    16: 'full_name',
    17: 'phone_number',
  },
  // 디비관리 탭 컬럼 인덱스 → 기대 헤더 텍스트
  DEST_HEADERS: {
    0: '접수일시',
    1: '담당자',
    2: '업장명',
    3: '업종',
    4: '이름',
    5: '전화번호',
    6: '마케팅 이력',
    7: '통화 가능 시간',
    11: '리드ID',
  },
};

const SCHEMA_ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1시간 — 스팸 방지

function validateSchema(srcSheet, destSheet) {
  const errors = [];

  const srcHeaders = srcSheet.getRange(1, 1, 1, srcSheet.getLastColumn()).getValues()[0];
  for (const idx in SCHEMA.SRC_HEADERS) {
    const expected = SCHEMA.SRC_HEADERS[idx];
    const actual = String(srcHeaders[idx] || '').trim();
    if (actual !== expected) {
      errors.push('원본 탭 [' + idx + '] 기대="' + expected + '" / 실제="' + actual + '"');
    }
  }

  const destHeaders = destSheet.getRange(1, 1, 1, destSheet.getLastColumn()).getValues()[0];
  for (const idx in SCHEMA.DEST_HEADERS) {
    const expected = SCHEMA.DEST_HEADERS[idx];
    const actual = String(destHeaders[idx] || '').trim();
    if (actual !== expected) {
      errors.push('디비관리 탭 [' + idx + '] 기대="' + expected + '" / 실제="' + actual + '"');
    }
  }

  return errors;
}

function sendSchemaAlert(errors) {
  const props = PropertiesService.getScriptProperties();
  const lastAlert = parseInt(props.getProperty('lastSchemaAlertTime') || '0');
  if (Date.now() - lastAlert < SCHEMA_ALERT_COOLDOWN_MS) return;

  const description = errors.map(function(e) { return '• ' + e; }).join('\n');
  const payload = {
    content: '@here ⚠ **시트 스키마 변경 감지** — 자동화 중단됨',
    embeds: [{
      title: '컬럼 헤더 불일치',
      color: 15158332,
      description: description.length > 4000 ? description.substring(0, 4000) + '\n…' : description,
      footer: { text: 'lead-auto.gs · validateSchema (1시간 쿨다운)' },
    }],
  };
  try {
    UrlFetchApp.fetch(CONFIG.OPS_WEBHOOK, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
    props.setProperty('lastSchemaAlertTime', String(Date.now()));
  } catch (e) {
    Logger.log('[Schema Alert] 전송 실패: ' + e.message);
  }
}

// ============================================================================
// (1) 일일 헬스체크 — 매일 09시 자동 리포트 (2026-05-01 추가)
// ============================================================================
// 침묵 모드 자동화의 가장 큰 위험은 "조용히 죽어있는 것". 매일 한 번 살아있다는
// 신호를 발송하고, 동시에 미처리/실패/스키마 상태를 요약한다.
//
// 최초 1회 setupDailyHealthCheck() 실행 → 매일 09시 dailyHealthCheck 자동 실행
// ============================================================================

function setupDailyHealthCheck() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'dailyHealthCheck') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  ScriptApp.newTrigger('dailyHealthCheck')
    .timeBased()
    .atHour(9)
    .everyDays(1)
    .create();
  Logger.log('일일 헬스체크 트리거 설정 완료 (매일 09시)');
}

function dailyHealthCheck() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const srcSheet = ss.getSheetByName(CONFIG.SOURCE_TAB);
  const destSheet = ss.getSheetByName(CONFIG.DEST_TAB);

  if (!srcSheet || !destSheet) {
    sendHealthAlert('탭 미발견 — SOURCE_TAB/DEST_TAB 이름 변경됨', 'CRITICAL');
    return;
  }

  // 1) 스키마 상태
  const schemaErrors = validateSchema(srcSheet, destSheet);

  // 2) 원본 vs 디비관리 diff (cutoff 무시 — 진단 목적)
  const srcIds = new Set();
  const lastRow = srcSheet.getLastRow();
  if (lastRow > 1) {
    const srcData = srcSheet.getRange(2, 1, lastRow - 1, 1).getValues();
    srcData.forEach(function(row) {
      const id = String(row[0]).trim();
      if (id) srcIds.add(id);
    });
  }
  const destIds = getProcessedIdsFromDestSheet(destSheet);
  const missingIds = [];
  srcIds.forEach(function(id) { if (!destIds.has(id)) missingIds.push(id); });

  // 3) 24h 내 알림 활동
  const cutoff24h = Date.now() - 24 * 60 * 60 * 1000;
  const lastProcessed = parseInt(
    PropertiesService.getScriptProperties().getProperty('lastLeadProcessedTime') || '0'
  );
  const noActivity24h = lastProcessed < cutoff24h;

  // 4) 재시도 누적
  const failureCounts = getFailureCounts();
  const failingIds = Object.keys(failureCounts);

  // 리포트 구성
  const summary = [];
  summary.push('원본 ID 총: **' + srcIds.size + '**');
  summary.push('디비관리 처리: **' + destIds.size + '**');
  summary.push('미처리(cutoff 무시): **' + missingIds.length + '**');
  summary.push('재시도 중: **' + failingIds.length + '**');
  summary.push('24h 내 신규 알림: ' + (noActivity24h ? '**없음** ⚠' : '있음 ✓'));
  if (schemaErrors.length > 0) {
    summary.push('⚠ 스키마 불일치: **' + schemaErrors.length + '개**');
  } else {
    summary.push('스키마: 정상 ✓');
  }

  const isHealthy = schemaErrors.length === 0 && failingIds.length === 0 && !noActivity24h;
  const isWarn = schemaErrors.length > 0 || noActivity24h;
  const color = !isWarn ? 5763719 : (schemaErrors.length > 0 ? 15158332 : 16027660);
  // 초록 / 노랑 / 빨강

  const today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  const embed = {
    title: (isHealthy ? '✅' : (schemaErrors.length > 0 ? '🚨' : '⚠')) + ' 일일 헬스체크 — ' + today,
    color: color,
    description: summary.join('\n'),
    footer: { text: 'lead-auto.gs · dailyHealthCheck' },
  };
  if (missingIds.length > 0) {
    embed.fields = [{
      name: '미처리 ID 샘플 (최대 10개)',
      value: missingIds.slice(0, 10).join(', '),
      inline: false,
    }];
  }

  const payload = {
    content: schemaErrors.length > 0 ? '@here 🚨 스키마 이상' : null,
    embeds: [embed],
  };

  try {
    UrlFetchApp.fetch(CONFIG.OPS_WEBHOOK, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
  } catch (e) {
    Logger.log('[Health Check] 전송 실패: ' + e.message);
  }
}

function sendHealthAlert(message, level) {
  const isCritical = level === 'CRITICAL';
  const payload = {
    content: isCritical ? '@here 🚨 자동화 다운' : '⚠ 헬스체크 경고',
    embeds: [{
      title: level || 'WARNING',
      color: isCritical ? 15158332 : 16027660,
      description: String(message),
    }],
  };
  try {
    UrlFetchApp.fetch(CONFIG.OPS_WEBHOOK, {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });
  } catch (e) {
    Logger.log('[Health Alert] 전송 실패: ' + e.message);
  }
}

// ============================================================================
// (3) 누락 탐지 + 일괄 발송 — 수동 실행 도구 (2026-05-01 추가)
// ============================================================================
// migration cutoff에 묻혀 영영 알림이 안 가는 케이스를 진단/복구한다.
// findMissingLeads()로 진단 → 사용자 확인 → sendMissingByRows([행번호…])로 발송.
// ============================================================================

/**
 * 원본 탭에는 있는데 처리완료로 간주된 적이 없는 ID 조회.
 *
 * 처리완료 = 디비관리 L열에 있는 ID + (옵션) migration cutoff ID
 *
 * 호출 예:
 *   findMissingLeads()                            — 기본: cutoff 포함 (정확한 v2 이후 누락)
 *   findMissingLeads({ includeCutoff: false })    — cutoff 무시 (v1 시절 L열 빈 행도 다 나옴)
 *
 * 주의: v1 시절 디비관리 행은 L열(리드ID)이 비어있다. cutoff 포함 모드가 정상 진단.
 */
function findMissingLeads(options) {
  options = options || {};
  const includeCutoff = options.includeCutoff !== false; // 기본 true

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const srcSheet = ss.getSheetByName(CONFIG.SOURCE_TAB);
  const destSheet = ss.getSheetByName(CONFIG.DEST_TAB);
  if (!srcSheet || !destSheet) {
    Logger.log('시트를 찾을 수 없습니다.');
    return [];
  }

  const processedIds = getProcessedIdsFromDestSheet(destSheet);
  let cutoffSize = 0;
  if (includeCutoff) {
    const cutoffIds = getMigrationCutoffIds();
    cutoffSize = cutoffIds.size;
    cutoffIds.forEach(function(id) { processedIds.add(id); });
  }

  const srcData = srcSheet.getDataRange().getValues();
  const missing = [];
  for (let i = 1; i < srcData.length; i++) {
    const id = String(srcData[i][SRC.ID]).trim();
    if (!id) continue;
    if (!processedIds.has(id)) {
      missing.push({
        rowNumber: i + 1, // 시트 1-indexed
        id: id,
        업장명: String(srcData[i][SRC.STORE_NAME]).trim(),
        담당자: String(srcData[i][SRC.AD_NAME]).trim(),
        이름: String(srcData[i][SRC.FULL_NAME]).trim(),
        접수일시: formatDateTime(srcData[i][SRC.CREATED_TIME]),
      });
    }
  }

  Logger.log('=== findMissingLeads ===');
  Logger.log('모드: ' + (includeCutoff ? 'cutoff 포함 (정상 진단)' : 'cutoff 무시 (전수)'));
  Logger.log('원본 ID 총: ' + (srcData.length - 1));
  Logger.log('디비관리 L열 ID: ' + (processedIds.size - cutoffSize));
  if (includeCutoff) Logger.log('cutoff ID: ' + cutoffSize);
  Logger.log('미처리: ' + missing.length + '건');
  Logger.log('---');
  missing.forEach(function(m) {
    Logger.log('  행' + m.rowNumber + ' | ' + m.업장명 + ' | ' + m.담당자 +
               ' | ' + m.이름 + ' | ' + m.접수일시);
  });
  return missing;
}

/**
 * 지정한 행 번호들에 대해 디스코드 알림을 일괄 발송.
 *
 * 호출 예:
 *   sendMissingByRows([23, 28])                                 — 발송 + 디비관리에 append
 *   sendMissingByRows([23, 28], { appendToDestSheet: false })   — 발송만 (이미 디비관리에 있는 경우)
 *
 * 행 번호는 원본 탭(SOURCE_TAB) 기준 1-indexed (시트에 보이는 행 번호 그대로).
 */
function sendMissingByRows(rowNumbers, options) {
  if (!Array.isArray(rowNumbers) || rowNumbers.length === 0) {
    Logger.log('행 번호 배열이 필요합니다. 예: sendMissingByRows([23, 28])');
    return [];
  }
  options = options || {};
  const appendToDest = options.appendToDestSheet !== false;

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const srcSheet = ss.getSheetByName(CONFIG.SOURCE_TAB);
  const destSheet = ss.getSheetByName(CONFIG.DEST_TAB);
  if (!srcSheet || !destSheet) {
    Logger.log('시트를 찾을 수 없습니다.');
    return [];
  }

  const lastCol = srcSheet.getLastColumn();
  const results = [];

  for (let i = 0; i < rowNumbers.length; i++) {
    const rowNum = rowNumbers[i];
    const row = srcSheet.getRange(rowNum, 1, 1, lastCol).getValues()[0];
    const id = String(row[SRC.ID]).trim();
    if (!id) {
      results.push({ row: rowNum, status: '실패: ID 없음' });
      continue;
    }
    const lead = {
      접수일시: formatDateTime(row[SRC.CREATED_TIME]),
      담당자: String(row[SRC.AD_NAME]).trim(),
      업장명: String(row[SRC.STORE_NAME]).trim(),
      업종: String(row[SRC.BUSINESS_TYPE]).trim(),
      이름: String(row[SRC.FULL_NAME]).trim(),
      전화번호: formatPhone(row[SRC.PHONE]),
      마케팅이력: String(row[SRC.MARKETING_HISTORY]).trim(),
      통화가능시간: String(row[SRC.CALL_TIME]).trim(),
    };
    const sent = sendDiscordNotification(lead);
    if (sent && appendToDest) {
      destSheet.appendRow([
        lead.접수일시, lead.담당자, lead.업장명, lead.업종,
        lead.이름, lead.전화번호, lead.마케팅이력, lead.통화가능시간, '', '', '', id,
      ]);
    }
    results.push({
      row: rowNum,
      업장명: lead.업장명,
      status: sent ? (appendToDest ? '성공 (시트 추가)' : '성공 (디스코드만)') : '실패',
    });
    Utilities.sleep(1000); // rate limit 회피
  }

  results.forEach(function(r) {
    Logger.log('행' + r.row + ' | ' + (r.업장명 || '-') + ' | ' + r.status);
  });
  return results;
}
