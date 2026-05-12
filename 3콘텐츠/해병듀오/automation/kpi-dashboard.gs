// ============================================================
// 해병듀오 KPI 대시보드 — 디스코드 전송 스크립트
// J열: 현재 단계 (퍼널), K열: 결과 (진행 중/이탈/계약 완료)
// ============================================================

const KPI_TAB_NAME = '디비관리(병의원&뷰티)';
const KPI_WEBHOOK_URL = 'https://discord.com/api/webhooks/1486341655392157786/z8o9KxR11Tb33kain3vVyNMxKJu5u5lzcvzR0RX_yg-aZzjId1M_gl2Y_cksjsKfAJeg';

// 퍼널 레벨 — 공백 제거 기준으로 통일
const KPI_FUNNEL_LEVEL = {
  '전화못함': 0,
  '전화완료': 1,
  '제안서전달': 2,
  '미팅완료': 3,
  '계약완료': 4
};

/**
 * 메인 함수: 시트 읽기 → 집계 → 디스코드 전송
 */
function sendKPIDashboard() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(KPI_TAB_NAME);

  if (!sheet) {
    Logger.log('[KPI] 탭을 찾을 수 없음: ' + KPI_TAB_NAME);
    return;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    kpiSendToDiscord(kpiBuildEmptyMessage());
    return;
  }

  // A열(접수일시) + J열(현재 단계) + K열(결과) 읽기
  const aValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const jValues = sheet.getRange(2, 10, lastRow - 1, 1).getValues();
  const kValues = sheet.getRange(2, 11, lastRow - 1, 1).getValues();

  // 집계
  let kpiTotalDB = 0;
  const kpiCounts = {
    funnel: { 1: 0, 2: 0, 3: 0, 4: 0 },
    전화못함: 0,
    이탈: 0,
    진행중: 0,
    계약완료: 0,
    미처리: 0
  };

  for (let i = 0; i < aValues.length; i++) {
    if (!aValues[i][0] || String(aValues[i][0]).trim() === '') continue;

    kpiTotalDB++;

    // J열: 공백 제거 후 비교
    const stage = String(jValues[i][0]).trim().replace(/\s+/g, '');
    // K열: 공백 제거 후 비교
    const result = String(kValues[i][0]).trim().replace(/\s+/g, '');

    // J열이 비어있으면 미처리
    if (stage === '') {
      kpiCounts.미처리++;
      continue;
    }

    // 퍼널 레벨 판별
    const level = KPI_FUNNEL_LEVEL[stage];

    if (level === undefined) {
      // 알 수 없는 값 → 미처리 (Logger로 어느 행인지 확인 가능)
      Logger.log('[KPI] 미인식 단계값: "' + String(jValues[i][0]) + '" (행 ' + (i + 2) + ')');
      kpiCounts.미처리++;
      continue;
    }

    // 전화 못함 (퍼널 진입 전)
    if (level === 0) {
      kpiCounts.전화못함++;
      continue;
    }

    // 퍼널 누적 카운트
    for (let lvl = 1; lvl <= level; lvl++) {
      kpiCounts.funnel[lvl]++;
    }

    // K열: 결과 집계
    if (result === '이탈') {
      kpiCounts.이탈++;
    } else if (result === '진행중') {
      kpiCounts.진행중++;
    } else if (result === '계약완료') {
      kpiCounts.계약완료++;
    }
  }

  if (kpiTotalDB === 0) {
    kpiSendToDiscord(kpiBuildEmptyMessage());
    return;
  }

  const message = kpiBuildMessage(kpiTotalDB, kpiCounts);
  kpiSendToDiscord(message);
}

/**
 * KPI 메시지 조립
 */
function kpiBuildMessage(total, counts) {
  const today = kpiGetDateString();
  const pct = (n) => total > 0 ? (n / total * 100).toFixed(1) : '0.0';
  const maxDigits = String(total).length;
  const pad = (n) => String(n).padStart(maxDigits, ' ');

  const lines = [
    `📊 해병듀오 KPI 대시보드 (${today})`,
    `━━━━━━━━━━━━━━━━━━`,
    ``,
    `총 DB: ${total}건`,
    ``,
    `▼ 퍼널 전환율 (누적)`,
    `전화완료      ${kpiBar(counts.funnel[1], total)}  ${pad(counts.funnel[1])}건 (${pct(counts.funnel[1])}%)`,
    `제안서 전달   ${kpiBar(counts.funnel[2], total)}  ${pad(counts.funnel[2])}건 (${pct(counts.funnel[2])}%)`,
    `미팅 완료    ${kpiBar(counts.funnel[3], total)}  ${pad(counts.funnel[3])}건 (${pct(counts.funnel[3])}%)`,
    `계약완료     ${kpiBar(counts.funnel[4], total)}  ${pad(counts.funnel[4])}건 (${pct(counts.funnel[4])}%)`,
    ``,
    `▼ 결과 현황`,
    `진행 중      ${kpiBar(counts.진행중, total)}  ${pad(counts.진행중)}건 (${pct(counts.진행중)}%)`,
    `계약완료     ${kpiBar(counts.계약완료, total)}  ${pad(counts.계약완료)}건 (${pct(counts.계약완료)}%)`,
    `이탈         ${kpiBar(counts.이탈, total)}  ${pad(counts.이탈)}건 (${pct(counts.이탈)}%)`,
    `전화 못함    ${kpiBar(counts.전화못함, total)}  ${pad(counts.전화못함)}건 (${pct(counts.전화못함)}%)`,
    `미처리       ${kpiBar(counts.미처리, total)}  ${pad(counts.미처리)}건 (${pct(counts.미처리)}%)`
  ];

  return lines.join('\n');
}

function kpiBuildEmptyMessage() {
  return [
    `📊 해병듀오 KPI 대시보드 (${kpiGetDateString()})`,
    `━━━━━━━━━━━━━━━━━━`,
    `총 DB: 0건 — 데이터 없음`
  ].join('\n');
}

function kpiBar(count, total) {
  const BARS = 16;
  const filled = total > 0 ? Math.round((count / total) * BARS) : 0;
  return '█'.repeat(filled) + '░'.repeat(BARS - filled);
}

function kpiGetDateString() {
  return Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy.MM.dd');
}

function kpiSendToDiscord(message) {
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ content: message }),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(KPI_WEBHOOK_URL, options);
  Logger.log('[KPI] 디스코드 전송: ' + response.getResponseCode());
}

/**
 * 매일 23시 트리거 설정 — 최초 1회 실행
 */
function setKPITrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const trigger of triggers) {
    if (trigger.getHandlerFunction() === 'sendKPIDashboard') {
      ScriptApp.deleteTrigger(trigger);
    }
  }

  ScriptApp.newTrigger('sendKPIDashboard')
    .timeBased()
    .everyDays(1)
    .atHour(23)
    .inTimezone('Asia/Seoul')
    .create();

  Logger.log('[KPI] 트리거 등록 완료 — 매일 23시');
}
