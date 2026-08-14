import type { Metadata } from "next";
import "swagger-ui-react/swagger-ui.css";
import Brand from "@/app/Brand";
import TopNavigation from "@/app/TopNavigation";
import { openApiDocument } from "@/lib/openapi";
import SwaggerDocs from "./SwaggerDocs";

export const metadata: Metadata = { title: "API docs · Spendee companion" };

export default function ApiDocsPage() {
  return (
    <main className="api-docs-page">
      <header className="topbar">
        <div className="topbar-inner">
          <Brand />
          <div className="topbar-actions">
            <TopNavigation active="api-docs" />
          </div>
        </div>
      </header>
      <div className="api-docs-shell">
        <SwaggerDocs spec={openApiDocument} />
      </div>
    </main>
  );
}
