import { NextResponse } from "next/server";
import { getDatabase, getTransactionFilterOptions } from "@/lib/db";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getTransactionFilterOptions(getDatabase()));
}
