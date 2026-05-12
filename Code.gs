const SPREADSHEET_ID = '1Of74dPeWlo1jH2agQKhF5szXFPuHRQl_N6T3SrDyaIw';

function doPost(e) {
  try {
    let requestData = JSON.parse(e.postData.contents);
    let action = requestData.action;
    
    if (action === 'saveRecord') {
      return saveRecord(requestData);
    } else if (action === 'saveSettings') {
      return saveSettings(requestData);
    } else if (action === 'getDashboardData') {
      return getDashboardData(requestData);
    } else if (action === 'deleteRecord') {
      return deleteRecord(requestData);
    } else if (action === 'editRecord') {
      return editRecord(requestData);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Unknown action' }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput("Leave Management API is running.")
      .setMimeType(ContentService.MimeType.TEXT);
}

function getAppConfig() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName("AppConfig");
  if (!sheet) {
    sheet = ss.insertSheet("AppConfig");
    sheet.getRange("A1:B1").setValues([["設定項目", "設定內容"]]);
    sheet.getRange("A2:B2").setValues([["系統密碼", ""]]);
    sheet.getRange("A3:B3").setValues([["啟用密碼", false]]);
    sheet.getRange("A1:B1").setFontWeight("bold").setBackground("#f3f3f3");
    sheet.setFrozenRows(1);
  }
  return {
    password: String(sheet.getRange("B2").getValue() || ""),
    enabled: sheet.getRange("B3").getValue() === true
  };
}

function saveAppConfig(password, enabled) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName("AppConfig");
  if (!sheet) {
    getAppConfig();
    sheet = ss.getSheetByName("AppConfig");
  }
  if (password !== undefined) sheet.getRange("B2").setValue(password);
  if (enabled !== undefined) sheet.getRange("B3").setValue(enabled);
}

function getSheetForYear(year) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(year.toString());
  
  if (!sheet) {
    sheet = ss.insertSheet(year.toString());
    sheet.getRange("A1:F1").setValues([["日期", "假別", "時數", "備註", "建立時間", "關聯假日"]]);
    sheet.getRange("G1:H1").setValues([["設定項目", "設定內容"]]);
    sheet.getRange("G2:H2").setValues([["特休總天數", 14]]);
    sheet.getRange("G3:H3").setValues([["國定假日", "[]"]]);
    sheet.getRange("G4:H4").setValues([["加班補休", "[]"]]);
    sheet.getRange("A1:F1").setFontWeight("bold").setBackground("#f3f3f3");
    sheet.getRange("G1:H1").setFontWeight("bold").setBackground("#f3f3f3");
    sheet.setFrozenRows(1);
    sheet.getRange("A:A").setNumberFormat("yyyy-mm-dd");
  }
  return sheet;
}

function saveRecord(data) {
  const year = new Date(data.date).getFullYear() || new Date().getFullYear();
  const sheet = getSheetForYear(year);
  const aVals = sheet.getRange("A:A").getValues();
  let lastRow = 0;
  for (let i = aVals.length - 1; i >= 0; i--) {
    if (aVals[i][0] !== "") {
      lastRow = i + 1;
      break;
    }
  }
  const timestamp = new Date();
  sheet.getRange(lastRow + 1, 1, 1, 6).setValues([[
    data.date, 
    data.type, 
    data.hours, 
    data.note || "", 
    timestamp,
    data.holidayTargetDate || ""
  ]]);
  return ContentService.createTextOutput(JSON.stringify({ status: 'success' })).setMimeType(ContentService.MimeType.JSON);
}

function saveSettings(data) {
  const year = data.year;
  const sheet = getSheetForYear(year);
  sheet.getRange("H2").setValue(data.annualLeaveDays);
  sheet.getRange("H3").setValue(JSON.stringify(data.holidays));
  sheet.getRange("H4").setValue(JSON.stringify(data.overtimes || []));
  
  saveAppConfig(data.password, data.passwordEnabled);
  
  return ContentService.createTextOutput(JSON.stringify({ status: 'success' })).setMimeType(ContentService.MimeType.JSON);
}

function deleteRecord(data) {
  const year = new Date(data.date).getFullYear();
  const sheet = getSheetForYear(year);
  const values = sheet.getRange("E:E").getValues();
  const targetId = data.id;
  for (let i = values.length - 1; i >= 1; i--) {
    if (values[i][0] && new Date(values[i][0]).getTime() === new Date(targetId).getTime()) {
      sheet.getRange(i + 1, 1, 1, 6).deleteCells(SpreadsheetApp.Dimension.ROWS);
      return ContentService.createTextOutput(JSON.stringify({ status: 'success' })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Record not found' })).setMimeType(ContentService.MimeType.JSON);
}

function editRecord(data) {
  const year = new Date(data.date).getFullYear();
  const sheet = getSheetForYear(year);
  const values = sheet.getRange("E:E").getValues();
  const targetId = data.id;
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] && new Date(values[i][0]).getTime() === new Date(targetId).getTime()) {
      sheet.getRange(i + 1, 1, 1, 4).setValues([[data.date, data.type, data.hours, data.note || ""]]);
      sheet.getRange(i + 1, 6).setValue(data.holidayTargetDate || ""); 
      return ContentService.createTextOutput(JSON.stringify({ status: 'success' })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Record not found' })).setMimeType(ContentService.MimeType.JSON);
}

function getDashboardData(data) {
  const year = data.year || new Date().getFullYear();
  const sheet = getSheetForYear(year);
  const annualLeaveDays = sheet.getRange("H2").getValue() || 0;
  const holidaysStr = sheet.getRange("H3").getValue();
  const overtimesStr = sheet.getRange("H4").getValue();
  
  const appConfig = getAppConfig();
  const password = appConfig.password;
  const passwordEnabled = appConfig.enabled;
  
  let holidays = [];
  try { holidays = holidaysStr ? JSON.parse(holidaysStr) : []; } catch(e) {}
  
  let overtimes = [];
  try { overtimes = overtimesStr ? JSON.parse(overtimesStr) : []; } catch(e) {}

  const aVals = sheet.getRange("A:F").getValues();
  let records = [];
  for (let i = 1; i < aVals.length; i++) {
    if (aVals[i][0] !== "") {
      let d = aVals[i][0];
      let formattedDate = (d instanceof Date) ? Utilities.formatDate(d, Session.getScriptTimeZone(), "yyyy-MM-dd") : d.toString();
      let hDate = aVals[i][5];
      let formattedHolidayTargetDate = "";
      if (hDate) {
        formattedHolidayTargetDate = (hDate instanceof Date) ? Utilities.formatDate(hDate, Session.getScriptTimeZone(), "yyyy-MM-dd") : hDate.toString();
      }
      
      records.push({ 
        date: formattedDate, 
        type: aVals[i][1], 
        hours: Number(aVals[i][2]), 
        note: aVals[i][3], 
        id: aVals[i][4],
        holidayTargetDate: formattedHolidayTargetDate
      });
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ status: 'success', data: { 
    annualLeaveDays: Number(annualLeaveDays), 
    holidays: holidays, 
    overtimes: overtimes,
    records: records,
    password: password,
    passwordEnabled: passwordEnabled
  } })).setMimeType(ContentService.MimeType.JSON);
}
