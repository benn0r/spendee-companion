import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createReadOnlyMcpServer } from "@/lib/mcp-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const server = createReadOnlyMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await server.connect(transport);
  return transport.handleRequest(request);
}

export function GET() {
  return Response.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Method not allowed. Use Streamable HTTP POST requests.",
      },
      id: null,
    },
    { status: 405, headers: { Allow: "POST" } },
  );
}
