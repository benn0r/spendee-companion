import { expect, test } from "./fixture";
import { fantasyData, importCsv, openDashboard } from "./helpers";

test("MCP file upload supports full wallet replacement", async ({
  page,
}, testInfo) => {
  const { dates, variant } = fantasyData(testInfo, "MCP full import");
  const wallet = `Star Pouch ${variant}`;
  const header =
    "Date,Wallet,Type,Category name,Amount,Currency,Note,Labels,Author";
  const initialCsv = [
    header,
    `${dates[0]}T08:00:00+00:00,${wallet},Expense,Nebula Food,-12,CHF,Old comet snack ${variant},food,Nova Quill`,
    `${dates[1]}T09:00:00+00:00,${wallet},Expense,Portal Travel,-30,CHF,Old portal fare ${variant},travel,Orion Vale`,
  ].join("\n");
  const replacementCsv = [
    header,
    `${dates[2]}T10:00:00+00:00,${wallet},Income,Quest Rewards,75,CHF,Fresh guild reward ${variant},quest,Lyra Moss`,
  ].join("\n");

  await openDashboard(page);
  await importCsv(
    page,
    initialCsv,
    `mcp-initial-${variant}.csv`,
    /1 file processed · 2 imported/,
  );

  const response = await page.request.post("/mcp", {
    headers: { Accept: "application/json, text/event-stream" },
    data: {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: {
        name: "import_transaction_files",
        arguments: {
          files: [
            {
              filename: `mcp-full-${variant}.csv`,
              contentBase64: Buffer.from(replacementCsv).toString("base64"),
            },
          ],
          full: true,
        },
      },
    },
  });
  expect(response.ok()).toBeTruthy();
  const rpc = await response.json();
  expect(rpc.error).toBeUndefined();
  const imported = JSON.parse(rpc.result.content[0].text);
  expect(imported.summary).toEqual({
    total: 1,
    imported: 1,
    duplicates: 0,
    replaced: 2,
    files: 1,
    failed: 0,
  });

  await page.reload();
  await expect(page.getByText(`Fresh guild reward ${variant}`)).toBeVisible();
  await expect(page.getByText(`Old comet snack ${variant}`)).toHaveCount(0);
  await expect(page.getByText(`Old portal fare ${variant}`)).toHaveCount(0);
});
