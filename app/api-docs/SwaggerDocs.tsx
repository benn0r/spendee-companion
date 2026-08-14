"use client";

import SwaggerUI from "swagger-ui-react";

export default function SwaggerDocs({ spec }: { spec: object }) {
  return (
    <SwaggerUI
      deepLinking
      displayOperationId
      displayRequestDuration
      docExpansion="list"
      filter
      persistAuthorization
      requestSnippetsEnabled
      spec={spec}
      withCredentials
    />
  );
}
