import { NextResponse } from "next/server";
import {
  getDatabase,
  getMonthlyReport,
  setMonthlyReportColumns,
} from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getMonthlyReport(getDatabase()));
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as { columns?: unknown };
    if (
      !Array.isArray(body.columns) ||
      !body.columns.every(
        (column) =>
          typeof column === "object" &&
          column !== null &&
          typeof (column as { name?: unknown }).name === "string" &&
          Array.isArray((column as { categories?: unknown }).categories) &&
          (column as { categories: unknown[] }).categories.every(
            (category) => typeof category === "string",
          ) &&
          ((column as { budget?: unknown }).budget == null ||
            typeof (column as { budget?: unknown }).budget === "number"),
      )
    ) {
      return NextResponse.json(
        { error: "columns must contain a name and a list of categories." },
        { status: 400 },
      );
    }
    setMonthlyReportColumns(
      getDatabase(),
      body.columns as Array<{
        name: string;
        categories: string[];
        budget?: number | null;
      }>,
    );
    return NextResponse.json(getMonthlyReport(getDatabase()));
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not save report columns.",
      },
      { status: 400 },
    );
  }
}
