"use client";

import SwaggerUI from "swagger-ui-react";

export default function SwaggerDocs() {
  return (
    <SwaggerUI
      deepLinking
      displayOperationId
      displayRequestDuration
      docExpansion="list"
      filter
      persistAuthorization
      requestSnippetsEnabled
      url="/api/openapi"
      withCredentials
    />
  );
}
