// ============================================
// 모두마케팅 — 메타 리드 자동화 스크립트
// 0128병원SEO 탭 → 0330병원디비관리 탭 자동 정리 + 디스코드 알림
// ============================================

// ---- 설정 ----
const CONFIG = {
  SOURCE_TAB: '0128병원SEO',
  DEST_TAB: '0330병원디비관리',
  DISCORD_WEBHOOK: 'https://discord.com/api/webhooks/1487716752069623911/MlOmk1d92VXbAhAItMIV2nujjoYS-OWXr0cAEdgRxAD6fWUtfeeBjUbN1r11_MPmUQ5S',
};

// ---- 원본 탭 열 인덱스 (0부터 시작) ----
const SRC = {
  ID: 0,
  CREATED_TIME: 1,
  AD_NAME: 3,           // ad_name
  STORE_NAME: 12,       // 병원/클리닉명_(네이버_플레이스_기준)
  POSITION: 13,         // 운영_직함/직책
  FULL_NAME: 14,        // 이름
  PHONE: 15,            // 전화번호
};

/**
 * 메인 함수: 새 리드 감지 → 정리 → 디스코드 알림
 * 시간 기반 트리거로 1분마다 실행
 */
function processNewLeads() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const srcSheet = ss.getSheetByName(CONFIG.SOURCE_TAB);
  const destSheet = ss.getSheetByName(CONFIG.DEST_TAB);

  if (!srcSheet || !destSheet) {
    Logger.log('시트를 찾을 수 없습니다. 탭 이름을 확인하세요.');
    return;
  }

  const processedIds = getProcessedIds();
  const srcData = srcSheet.getDataRange().getValues();
  if (srcData.length <= 1) return;

  let newCount = 0;

  for (let i = 1; i < srcData.length; i++) {
    const row = srcData[i];
    const id = String(row[SRC.ID]).trim();

    if (!id || processedIds.has(id)) continue;

    const lead = {
      접수일시: formatDateTime(row[SRC.CREATED_TIME]),
      광고명: String(row[SRC.AD_NAME]).trim(),
      병원명: String(row[SRC.STORE_NAME]).trim(),
      직함: String(row[SRC.POSITION]).trim(),
      이름: String(row[SRC.FULL_NAME]).trim(),
      전화번호: formatPhone(row[SRC.PHONE]),
    };

    destSheet.appendRow([
      lead.접수일시,
      lead.병원명,
      lead.직함,
      lead.이름,
      lead.전화번호,
      '', // 메모 (수동 입력)
      '', // 퍼널단계 (수동 입력)
    ]);

    sendDiscordNotification(lead);

    processedIds.add(id);
    newCount++;
  }

  if (newCount > 0) {
    saveProcessedIds(processedIds);
    Logger.log(newCount + '건의 새 리드 처리 완료');
  }
}

/**
 * 전화번호 포맷팅
 * "p:+821082333783" → "010-8233-3783"
 */
function formatPhone(raw) {
  let phone = String(raw).trim();
  phone = phone.replace(/^p:/, '');

  if (phone.startsWith('+82')) {
    phone = '0' + phone.substring(3);
  }

  phone = phone.replace(/\D/g, '');

  if (phone.length === 11 && phone.startsWith('010')) {
    return phone.substring(0, 3) + '-' + phone.substring(3, 7) + '-' + phone.substring(7);
  }

  return phone;
}

/**
 * 날짜 포맷팅
 * "2026-03-24T16:05:50+09:00" → "2026-03-24 16:05"
 */
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

/**
 * 디스코드 웹훅 알림 전송
 */
function sendDiscordNotification(lead) {
  const payload = {
    embeds: [
      {
        title: '새 리드 접수 (모두마케팅)',
        color: 15105570, // 주황색
        fields: [
          { name: '병원/클리닉명', value: lead.병원명 || '-', inline: true },
          { name: '직함/직책', value: lead.직함 || '-', inline: true },
          { name: '이름', value: lead.이름 || '-', inline: true },
          { name: '전화번호', value: lead.전화번호 || '-', inline: true },
          { name: '광고명', value: lead.광고명 || '-', inline: true },
          { name: '접수 시간', value: lead.접수일시 || '-', inline: true },
        ],
      },
    ],
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  };

  try {
    const response = UrlFetchApp.fetch(CONFIG.DISCORD_WEBHOOK, options);
    if (response.getResponseCode() !== 204) {
      Logger.log('디스코드 전송 실패: ' + response.getContentText());
    }
  } catch (e) {
    Logger.log('디스코드 전송 에러: ' + e.message);
  }
}

/**
 * 처리된 ID 목록 관리 (PropertiesService 사용)
 */
function getProcessedIds() {
  const stored = PropertiesService.getScriptProperties().getProperty('processedIds');
  if (!stored) return new Set();
  return new Set(JSON.parse(stored));
}

function saveProcessedIds(idSet) {
  const arr = Array.from(idSet);
  const trimmed = arr.slice(-500);
  PropertiesService.getScriptProperties().setProperty('processedIds', JSON.stringify(trimmed));
}

// ============================================
// 초기 설정 함수 (최초 1회만 실행)
// ============================================

/**
 * 1분마다 자동 실행 트리거 설정
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
 * 기존 데이터 모두 처리 완료로 표시 (과거 데이터 스킵용)
 * 최초 설정 시 실행하면 기존 리드에 대해 알림이 가지 않음
 */
function markExistingAsProcessed() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const srcSheet = ss.getSheetByName(CONFIG.SOURCE_TAB);
  const srcData = srcSheet.getDataRange().getValues();

  const ids = new Set();
  for (let i = 1; i < srcData.length; i++) {
    const id = String(srcData[i][SRC.ID]).trim();
    if (id) ids.add(id);
  }

  saveProcessedIds(ids);
  Logger.log(ids.size + '건의 기존 리드를 처리 완료로 표시');
}
