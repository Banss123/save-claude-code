// ============================================================
// 작업대시보드 디스코드 알림 — Google Apps Script
// ============================================================
// 매일 오전 9시: 작업자 브리핑 + 영업자 리마인더 한 번에 전송
// ============================================================

const WEBHOOK_URL = "https://discord.com/api/webhooks/1487367651935256649/_O312_h5ug0JkDLCSh057VgrHwgDVbXauj-aOodBxAXIV7QRhCmknGrEzOMc7U5PFrFj";
const SHEET_GID = "1745458485";

// 작업자 매장
const WORKER_STORES = [
  "재주좋은치과", "벨라르시 뷰티살롱", "성수 일미락", "호이식",
  "무채색", "셀린의원 홍대점", "셀린의원 명동점", "똑똑플란트치과",
  "나미브로우", "해목 서촌점", "우주집"
];

// 영업자 매장
const SALES_STORES = [
  "오블리주의원", "에버피부과의원", "모클락 강남본점",
  "지노스피자 이태원", "지노스피자 압구정"
];

// 미비사항 판정: O, X 외 모든 값은 미비사항
function isIncomplete(val) {
  const v = normalize(val);
  if (!v) return true;
  if (v.toUpperCase() === "O") return false;
  if (v.toUpperCase() === "X") return false;
  return true;
}

function isNotApplicable(val) {
  const v = normalize(val);
  return v && v.toUpperCase() === "X";
}

// ─────────────────────────────────────────────
// 트리거 설정 (최초 1회 실행)
// ─────────────────────────────────────────────
function setTriggers() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === "sendDailyBriefing") {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger("sendDailyBriefing")
    .timeBased()
    .everyDays(1)
    .atHour(9)
    .create();

  Logger.log("트리거 설정 완료: 매일 오전 9시 sendDailyBriefing");
}

// ─────────────────────────────────────────────
// 유틸 함수
// ─────────────────────────────────────────────
function parseDate(cellValue) {
  if (!cellValue) return null;
  const str = String(cellValue).trim();

  if (cellValue instanceof Date && !isNaN(cellValue)) {
    cellValue._isStart = false;
    return cellValue;
  }

  const isStart = str.includes("(시작)");
  const cleaned = str.replace("(시작)", "").trim();
  const match = cleaned.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})/);
  if (!match) return null;

  const date = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]));
  date._isStart = isStart;
  return date;
}

function formatDate(date) {
  if (!date) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}.${m}.${d}`;
}

function normalize(val) {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  if (str === "" || str === "-") return null;
  return str;
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  for (const s of ss.getSheets()) {
    if (String(s.getSheetId()) === SHEET_GID) return s;
  }
  return null;
}

function sendToDiscord(message) {
  const options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ content: message }),
    muteHttpExceptions: true,
  };
  const response = UrlFetchApp.fetch(WEBHOOK_URL, options);
  Logger.log(`디스코드 전송: ${response.getResponseCode()}`);
}

function getDayName() {
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  return days[new Date().getDay()];
}

function getExpiryInfo(row, today) {
  const endDateRaw = row[2];
  const endDateStr = normalize(endDateRaw);
  if (!endDateStr) return null;

  const endDate = parseDate(endDateRaw !== "" ? endDateRaw : endDateStr);
  if (!endDate || endDate._isStart) return null;

  endDate.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((endDate - today) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { level: "expired", d: Math.abs(diffDays), date: formatDate(endDate) };
  if (diffDays <= 7) return { level: "urgent", d: diffDays, date: formatDate(endDate) };
  if (diffDays <= 14) return { level: "caution", d: diffDays, date: formatDate(endDate) };
  return { level: "ok", d: diffDays, date: formatDate(endDate) };
}

// ─────────────────────────────────────────────
// 메인 함수: 작업자 + 영업자 통합 브리핑 (매일 오전 9시)
// ─────────────────────────────────────────────
function sendDailyBriefing() {
  const sheet = getSheet();
  if (!sheet) { Logger.log("시트 못 찾음"); return; }

  const data = sheet.getRange(2, 1, 18, 15).getValues();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dateStr = formatDate(today);
  const dayName = getDayName();

  // ── 작업자 매장 ──
  const storeReports = [];

  for (const row of data) {
    const storeName = normalize(row[0]);
    if (!storeName || !WORKER_STORES.includes(storeName)) continue;

    const report = { name: storeName, expiry: null, issues: [] };
    report.expiry = getExpiryInfo(row, today);

    if (!isNotApplicable(row[4]) && isIncomplete(row[4])) report.issues.push("주간보고");
    if (!isNotApplicable(row[5]) && isIncomplete(row[5])) report.issues.push("업뎃글");

    if (!isNotApplicable(row[9]) && isIncomplete(row[9])) {
      const reviewer = normalize(row[8]) || "리뷰어1";
      report.issues.push(`리뷰 업로드1(${reviewer})`);
    }

    if (!isNotApplicable(row[11]) && isIncomplete(row[11])) {
      const reviewer = normalize(row[10]) || "리뷰어2";
      report.issues.push(`리뷰 업로드2(${reviewer})`);
    }

    storeReports.push(report);
  }

  // 작업자 메시지 조립
  const lines = [];
  lines.push(`📋 **작업대시보드 일일 브리핑** (${dateStr} ${dayName})`);
  lines.push("━━━━━━━━━━━━━━━━━━");

  const expired = storeReports.filter(r => r.expiry && r.expiry.level === "expired");
  const urgents = storeReports.filter(r => r.expiry && r.expiry.level === "urgent");
  const cautions = storeReports.filter(r => r.expiry && r.expiry.level === "caution");

  if (expired.length > 0) {
    lines.push("\n⚫ **계약 만료됨**");
    expired.forEach(r => lines.push(`• ${r.name} — ${r.expiry.d}일 경과 (${r.expiry.date})`));
  }

  if (urgents.length > 0) {
    lines.push("\n🔴 **계약 종료 임박 (7일 이내)**");
    urgents.forEach(r => lines.push(`• ${r.name} — D-${r.expiry.d} (${r.expiry.date})`));
  }

  if (cautions.length > 0) {
    lines.push("\n🟡 **계약 종료 주의 (14일 이내)**");
    cautions.forEach(r => lines.push(`• ${r.name} — D-${r.expiry.d} (${r.expiry.date})`));
  }

  const withIssues = storeReports.filter(r => r.issues.length > 0);
  const noIssues = storeReports.filter(r => r.issues.length === 0);

  if (withIssues.length > 0) {
    lines.push("\n📌 **이번 주 미비사항**");
    withIssues.forEach(r => {
      lines.push(`• ${r.name} — ${r.issues.join(", ")}`);
    });
  }

  if (noIssues.length > 0) {
    lines.push(`\n✅ **미비 없음**: ${noIssues.map(r => r.name).join(", ")}`);
  }

  if (withIssues.length === 0 && expired.length === 0 && urgents.length === 0 && cautions.length === 0) {
    lines.push("\n🎉 모든 매장 정상!");
  }

  // ── 영업자 매장 ──
  lines.push("\n\n📎 **영업자 매장 체크**");
  lines.push("━━━━━━━━━━━━━━━━━━");
  lines.push("");

  for (const row of data) {
    const storeName = normalize(row[0]);
    if (!storeName || !SALES_STORES.includes(storeName)) continue;

    const expiry = getExpiryInfo(row, today);
    let expiryText = "";

    if (expiry) {
      if (expiry.level === "expired") expiryText = ` — ⚫ ${expiry.d}일 경과`;
      else if (expiry.level === "urgent") expiryText = ` — 🔴 D-${expiry.d}`;
      else if (expiry.level === "caution") expiryText = ` — 🟡 D-${expiry.d}`;
      else expiryText = ` — D-${expiry.d}`;
    }

    lines.push(`• ${storeName}${expiryText}`);
  }

  lines.push("");
  lines.push("**체크 항목:**");
  lines.push("□ 주간보고 발행 여부");
  lines.push("□ 소식글 발행 여부");
  lines.push("□ 리뷰 발행 여부");
  lines.push("□ 리뷰 답변 현황");

  sendToDiscord(lines.join("\n"));
}
