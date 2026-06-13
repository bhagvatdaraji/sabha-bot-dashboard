const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { outputDir, timezone } = require("./config");
const { dayjs } = require("./helpers");

function sanitizeFileName(value) {
  return value.replace(/[^a-z0-9-_]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
}

async function generateSabhaReport(workweek) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Kishore Sabha Coordinator";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Sabha Report", {
    views: [{ state: "frozen", ySplit: 5 }]
  });

  const formattedDate = dayjs(`${workweek.sabhaDate}T${workweek.sabhaTime}`).tz(timezone).format("dddd, MMMM D, YYYY");
  const formattedTime = dayjs(`${workweek.sabhaDate}T${workweek.sabhaTime}`).tz(timezone).format("h:mm A");

  sheet.mergeCells("A1:F1");
  sheet.getCell("A1").value = "Kishore Sabha Role Report";
  sheet.getCell("A1").font = { size: 18, bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "8B5A00" }
  };
  sheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  sheet.getRow(1).height = 26;

  sheet.getCell("A2").value = "Sabha Date";
  sheet.getCell("B2").value = formattedDate;
  sheet.getCell("D2").value = "Sabha Time";
  sheet.getCell("E2").value = formattedTime;
  sheet.getCell("A3").value = "Generated";
  sheet.getCell("B3").value = new Date();
  sheet.getCell("B3").numFmt = "mmmm d, yyyy h:mm AM/PM";

  const headerRow = 5;
  const headers = ["Role", "Assigned Member", "BKMS ID", "Status", "Decline Reason", "Assignment Send Status"];
  headers.forEach((header, index) => {
    const cell = sheet.getCell(headerRow, index + 1);
    cell.value = header;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "B6791B" }
    };
    cell.alignment = { horizontal: "center", vertical: "middle" };
    cell.border = {
      top: { style: "thin", color: { argb: "E0C28A" } },
      left: { style: "thin", color: { argb: "E0C28A" } },
      bottom: { style: "thin", color: { argb: "E0C28A" } },
      right: { style: "thin", color: { argb: "E0C28A" } }
    };
  });

  const rows = workweek.assignments.map((assignment) => {
    let status = "Awaiting response";
    if (assignment.confirmedAt) {
      status = "Confirmed";
    } else if (assignment.declinedAt) {
      status = "Declined";
    }

    let sendStatus = "Not sent";
    if (assignment.needsResend) {
      sendStatus = "Edited after send";
    } else if (assignment.sendCount === 1) {
      sendStatus = "Sent once";
    } else if (assignment.sendCount > 1) {
      sendStatus = `Sent ${assignment.sendCount} times`;
    }

    return [
      assignment.roleName,
      assignment.personName,
      assignment.bkmsId || "",
      status,
      assignment.declineReason || "",
      sendStatus
    ];
  });

  rows.forEach((row, rowIndex) => {
    const excelRow = sheet.getRow(headerRow + 1 + rowIndex);
    excelRow.values = row;
    excelRow.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "EBDAB7" } },
        left: { style: "thin", color: { argb: "EBDAB7" } },
        bottom: { style: "thin", color: { argb: "EBDAB7" } },
        right: { style: "thin", color: { argb: "EBDAB7" } }
      };
      cell.alignment = { vertical: "top", wrapText: true };
    });
    if (rowIndex % 2 === 0) {
      excelRow.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF7EA" }
        };
      });
    }
  });

  sheet.columns = [
    { width: 22 },
    { width: 24 },
    { width: 16 },
    { width: 18 },
    { width: 36 },
    { width: 24 }
  ];

  const reportOutputDir = path.join(outputDir, "reports");
  fs.mkdirSync(reportOutputDir, { recursive: true });
  const fileName = `${sanitizeFileName(`sabha-report-${workweek.sabhaDate}-${Date.now()}`)}.xlsx`;
  const filePath = path.join(reportOutputDir, fileName);
  await workbook.xlsx.writeFile(filePath);

  return { fileName, filePath };
}

module.exports = {
  generateSabhaReport
};
