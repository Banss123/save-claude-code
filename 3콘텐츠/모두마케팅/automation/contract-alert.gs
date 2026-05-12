// ============================================
// 모두마케팅 — 계약종료 카운트 알림
// 구글SEO 체크리스트 시트에서 종료일 읽어서 디스코드 발송
// D-30, D-20, D-10, D-9 ~ D-1 매일
// ============================================

// ---- 설정 ----
const CONTRACT_CONFIG = {
  SHEET_ID: '1G5LN-o-4jzjNtW9Ur4-Z39XxaMExPym6q6KyvIgiSAs',
  TAB_NAME: '구글SEO 체크리스트',
  STORE_COL: 0,    // A열: 매장명
  END_DATE_COL: 2, // C열: 계약 종료일
  DISCORD_WEBHOOK: 'https://discord.com/api/webhooks/1488120676744171550/S2N-vAKehhpeiOXfnR21aylVlacRf3VmB0jH2SpRKw-tjPBSb2-O29l8pSK5DOLx1Ofr',
  TARGET_STORES: ['재주좋은치과', '오블리주의원', '에버피부과의원'],
  ALERT_DAYS: [20, 10, 7, 6, 5, 4, 3, 2, 1, 0],
};

/**
 * 메인 함수: 계약종료 카운트 체크 + 디스코드 알림
 * 매일 오전 9시 트리거 권장
 */
function checkContractExpiry() {
  const ss = SpreadsheetApp.openById(CONTRACT_CONFIG.SHEET_ID);
  const sheet = ss.getSheetByName(CONTRACT_CONFIG.TAB_NAME);

  if (!sheet) {
    Logger.log('시트를 찾을 수 없습니다: ' + CONTRACT_CONFIG.TAB_NAME);
    return;
  }

  const data = sheet.getDataRange().getValues();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const alerts = [];

  for (let i = 1; i < data.length; i++) {
    const storeName = String(data[i][CONTRACT_CONFIG.STORE_COL]).trim();
    const endDateRaw = data[i][CONTRACT_CONFIG.END_DATE_COL];

    // 대상 매장만 필터
    const matched = CONTRACT_CONFIG.TARGET_STORES.find(function(t) {
      return storeName.indexOf(t) !== -1;
    });
    if (!matched) continue;

    // 종료일 파싱
    const endDate = new Date(endDateRaw);
    if (isNaN(endDate.getTime())) continue;
    endDate.setHours(0, 0, 0, 0);

    // D-day 계산
    const diffMs = endDate.getTime() - today.getTime();
    const dDay = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    // 알림 대상 날짜이거나 이미 만료된 경우
    if (CONTRACT_CONFIG.ALERT_DAYS.indexOf(dDay) !== -1 || dDay < 0) {
      alerts.push({ store: storeName, dDay: dDay, endDate: formatDate(endDate) });
    }
  }

  if (alerts.length > 0) {
    sendContractAlert(alerts);
    Logger.log(alerts.length + '건의 계약종료 알림 전송');
  } else {
    Logger.log('오늘 알림 대상 없음');
  }
}

/**
 * 디스코드 알림 전송
 */
function sendContractAlert(alerts) {
  const fields = alerts.map(function(a) {
    let status;
    if (a.dDay < 0) {
      status = '만료됨 (' + Math.abs(a.dDay) + '일 경과)';
    } else if (a.dDay === 0) {
      status = '오늘 만료';
    } else {
      status = 'D-' + a.dDay;
    }

    return {
      name: a.store,
      value: status + ' (종료일: ' + a.endDate + ')',
      inline: false,
    };
  });

  // 긴급도별 색상
  const minDDay = Math.min.apply(null, alerts.map(function(a) { return a.dDay; }));
  let color;
  if (minDDay <= 0) {
    color = 15548997;  // 빨간색
  } else if (minDDay <= 9) {
    color = 15105570;  // 주황색
  } else {
    color = 16776960;  // 노란색
  }

  const payload = {
    embeds: [
      {
        title: '계약종료 카운트 (모두마케팅)',
        color: color,
        fields: fields,
        footer: { text: '대상: 재주좋은치과, 오블리주의원, 에버피부과의원' },
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
    const response = UrlFetchApp.fetch(CONTRACT_CONFIG.DISCORD_WEBHOOK, options);
    if (response.getResponseCode() !== 204) {
      Logger.log('디스코드 전송 실패: ' + response.getContentText());
    }
  } catch (e) {
    Logger.log('디스코드 전송 에러: ' + e.message);
  }
}

/**
 * 날짜 포맷
 */
function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + d;
}

// ============================================
// 초기 설정 함수 (최초 1회만 실행)
// ============================================

/**
 * 매일 오전 9시 자동 실행 트리거 설정
 */
function setupContractTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'checkContractExpiry') {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('checkContractExpiry')
    .timeBased()
    .atHour(9)
    .everyDays(1)
    .inTimezone('Asia/Seoul')
    .create();

  Logger.log('트리거 설정 완료: 매일 09시 checkContractExpiry 실행');
}
