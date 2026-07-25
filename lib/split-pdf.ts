import PDFDocument from "pdfkit/js/pdfkit.standalone.js";

type SplitPdfData = {
  id: number;
  title: string;
  splitCount: number;
  totalAmount: number;
  splitAmount: number;
  currency: string;
  createdAt: string;
  entries: Array<{
    kind: "transaction" | "custom";
    description: string;
    amount: number;
    date: string | null;
    wallet: string | null;
    categoryName: string | null;
  }>;
};

function money(amount: number, currency: string) {
  return new Intl.NumberFormat("en-CH", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
}

export function createSplitPdf(split: SplitPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ size: "A4", margin: 48, bufferPages: true, info: {
      Title: split.title,
      Author: "Spendee companion",
    } });
    const chunks: Buffer[] = [];
    document.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    document.on("end", () => resolve(Buffer.concat(chunks)));
    document.on("error", reject);

    const green = "#12c48b";
    const slate = "#344554";
    const muted = "#6c767f";
    const line = "#e4e9ee";
    const right = 547;

    document.fillColor(green).font("Helvetica-Bold").fontSize(10).text("SPENDEE COMPANION");
    document.moveDown(0.2);
    document.fillColor(slate).fontSize(24).text(split.title);
    document.moveDown(0.1);
    document.fillColor(muted).font("Helvetica").fontSize(9)
      .text(`Created ${new Intl.DateTimeFormat("en-CH", { dateStyle: "long", timeStyle: "short" }).format(new Date(split.createdAt))}`);
    document.moveDown(1);

    const summaryTop = document.y;
    document.roundedRect(48, summaryTop, 499, 62, 8).fill("#f4faf8");
    const summaries = [
      ["TOTAL", money(split.totalAmount, split.currency)],
      ["SPLIT HOW MANY TIMES", String(split.splitCount)],
      ["FINAL SPLIT AMOUNT", money(split.splitAmount, split.currency)],
    ];
    summaries.forEach(([label, value], index) => {
      const x = 64 + index * 160;
      document.fillColor(muted).font("Helvetica-Bold").fontSize(7).text(label, x, summaryTop + 16, { width: 145 });
      document.fillColor(slate).fontSize(14).text(value, x, summaryTop + 29, { width: 145 });
    });
    document.y = summaryTop + 80;

    document.fillColor(slate).font("Helvetica-Bold").fontSize(13)
      .text("Positions", 48, document.y, { width: 499, align: "left" });
    document.moveDown(0.35);
    const tableHeaderY = document.y;
    document.fillColor(muted).fontSize(7)
      .text("DATE", 48, tableHeaderY, { width: 70, lineBreak: false })
      .text("DESCRIPTION", 126, tableHeaderY, { width: 260, lineBreak: false })
      .text("AMOUNT", 400, tableHeaderY, { width: 147, align: "right", lineBreak: false });
    document.y = tableHeaderY + 12;
    document.strokeColor(line).moveTo(48, document.y).lineTo(right, document.y).stroke();
    document.y += 7;

    for (const entry of split.entries) {
      if (document.y > 735) {
        document.addPage();
        document.fillColor(slate).font("Helvetica-Bold").fontSize(13).text(`${split.title} - Positions`);
        document.moveDown(0.5);
      }
      const y = document.y;
      const formattedDate = entry.date
        ? new Intl.DateTimeFormat("en-CH", { dateStyle: "medium" }).format(new Date(entry.date))
        : "-";
      document.fillColor(muted).font("Helvetica").fontSize(8)
        .text(formattedDate, 48, y + 1, { width: 70 });
      document.fillColor(slate).font("Helvetica-Bold").fontSize(9)
        .text(entry.description, 126, y, { width: 260 });
      const details = entry.kind === "custom"
        ? "Custom position"
        : [
            entry.wallet,
            entry.categoryName,
          ].filter(Boolean).join("  |  ");
      document.fillColor(muted).font("Helvetica").fontSize(7).text(details, 126, y + 12, { width: 260 });
      document.fillColor(slate).font("Helvetica-Bold").fontSize(9)
        .text(money(entry.amount, split.currency), 400, y + 1, { width: 147, align: "right" });
      document.y = y + 25;
      document.strokeColor(line).moveTo(48, document.y).lineTo(right, document.y).stroke();
      document.y = y + 31;
    }

    const pageRange = document.bufferedPageRange();
    for (let index = pageRange.start; index < pageRange.start + pageRange.count; index += 1) {
      document.switchToPage(index);
      document.fillColor(muted).font("Helvetica").fontSize(7)
        .text(`Spendee companion  |  ${split.title}  |  Page ${index + 1}`, 48, 785, {
          width: 499,
          align: "center",
          lineBreak: false,
        });
    }
    document.end();
  });
}
