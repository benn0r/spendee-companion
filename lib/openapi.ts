const errorResponse = {
  description: "The request could not be completed.",
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/Error" },
    },
  },
};

const transactionBody = {
  required: true,
  content: {
    "application/json": {
      schema: { $ref: "#/components/schemas/TransactionInput" },
    },
  },
};

export const openApiDocument = {
  openapi: "3.0.3",
  info: {
    title: "Spendee companion API",
    version: "1.0.0",
    description:
      "Read reference data and transactions from Actual Budget, create or remove Actual transactions, and process receipts.",
  },
  tags: [
    { name: "References", description: "Actual Budget IDs for API inputs." },
    { name: "Transactions", description: "Actual Budget ledger operations." },
    { name: "Receipts", description: "Receipt extraction and submission." },
  ],
  security: [{ bearerAuth: [] }, { basicAuth: [] }],
  paths: {
    "/api/references": {
      get: {
        tags: ["References"],
        operationId: "listReferences",
        summary: "List accounts, categories, and tags",
        responses: {
          "200": {
            description: "Current Actual Budget reference data.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/References" },
              },
            },
          },
          "401": errorResponse,
          "502": errorResponse,
        },
      },
    },
    "/api/transactions": {
      get: {
        tags: ["Transactions"],
        operationId: "listTransactions",
        summary: "List transactions",
        parameters: [
          {
            name: "page",
            in: "query",
            schema: { type: "integer", minimum: 1, default: 1 },
          },
          {
            name: "pageSize",
            in: "query",
            schema: {
              type: "integer",
              minimum: 10,
              maximum: 100,
              default: 25,
            },
          },
          {
            name: "dateFrom",
            in: "query",
            schema: { type: "string", format: "date" },
          },
          {
            name: "dateTo",
            in: "query",
            schema: { type: "string", format: "date" },
          },
          {
            name: "wallet",
            in: "query",
            description: "Repeat to select more than one account name.",
            schema: { type: "array", items: { type: "string" } },
            style: "form",
            explode: true,
          },
          {
            name: "category",
            in: "query",
            description: "Repeat to select more than one category name.",
            schema: { type: "array", items: { type: "string" } },
            style: "form",
            explode: true,
          },
          {
            name: "tag",
            in: "query",
            description: "Repeat to select more than one tag name.",
            schema: { type: "array", items: { type: "string" } },
            style: "form",
            explode: true,
          },
          {
            name: "type",
            in: "query",
            schema: {
              type: "array",
              items: {
                type: "string",
                enum: ["Expense", "Income", "Transfer"],
              },
            },
            style: "form",
            explode: true,
          },
          {
            name: "amountOperator",
            in: "query",
            schema: { type: "string", enum: ["gt", "lt", "eq"] },
          },
          { name: "amount", in: "query", schema: { type: "number" } },
        ],
        responses: {
          "200": {
            description: "A filtered page of transactions.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TransactionPage" },
              },
            },
          },
          "401": errorResponse,
          "502": errorResponse,
        },
      },
      post: {
        tags: ["Transactions"],
        operationId: "createTransaction",
        summary: "Create an uncleared Actual transaction",
        requestBody: transactionBody,
        responses: {
          "201": {
            description: "Transaction created.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Created" },
              },
            },
          },
          "400": errorResponse,
          "401": errorResponse,
          "502": errorResponse,
        },
      },
    },
    "/api/transactions/{id}": {
      delete: {
        tags: ["Transactions"],
        operationId: "deleteTransaction",
        summary: "Delete an Actual transaction",
        parameters: [{ $ref: "#/components/parameters/TransactionId" }],
        responses: {
          "204": { description: "Transaction deleted." },
          "401": errorResponse,
          "404": errorResponse,
          "502": errorResponse,
        },
      },
    },
    "/api/receipts": {
      get: {
        tags: ["Receipts"],
        operationId: "listReceipts",
        summary: "List receipts",
        responses: {
          "200": {
            description: "Newest receipts first.",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["receipts"],
                  properties: {
                    receipts: {
                      type: "array",
                      items: { $ref: "#/components/schemas/Receipt" },
                    },
                  },
                },
              },
            },
          },
          "401": errorResponse,
        },
      },
      post: {
        tags: ["Receipts"],
        operationId: "uploadReceipt",
        summary: "Upload a receipt for extraction",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["account", "receipt"],
                properties: {
                  account: {
                    type: "string",
                    format: "uuid",
                    description: "Actual account ID from /api/references.",
                  },
                  receipt: {
                    type: "string",
                    format: "binary",
                    description: "JPEG, PNG, WebP, or PDF up to 10 MB.",
                  },
                },
              },
            },
          },
        },
        responses: {
          "202": {
            description: "Receipt queued for extraction.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Queued" },
              },
            },
          },
          "400": errorResponse,
          "401": errorResponse,
        },
      },
    },
    "/api/receipts/{id}": {
      get: {
        tags: ["Receipts"],
        operationId: "getReceipt",
        summary: "Get a receipt and its extraction result",
        parameters: [{ $ref: "#/components/parameters/ReceiptId" }],
        responses: {
          "200": {
            description: "Receipt record.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Receipt" },
              },
            },
          },
          "401": errorResponse,
          "404": errorResponse,
        },
      },
      delete: {
        tags: ["Receipts"],
        operationId: "deleteReceipt",
        summary: "Delete a receipt and its stored file",
        parameters: [{ $ref: "#/components/parameters/ReceiptId" }],
        responses: {
          "204": { description: "Receipt deleted." },
          "401": errorResponse,
          "404": errorResponse,
        },
      },
    },
    "/api/receipts/{id}/file": {
      get: {
        tags: ["Receipts"],
        operationId: "getReceiptFile",
        summary: "View the original receipt",
        parameters: [{ $ref: "#/components/parameters/ReceiptId" }],
        responses: {
          "200": {
            description: "Original image or PDF.",
            content: {
              "image/jpeg": { schema: { type: "string", format: "binary" } },
              "image/png": { schema: { type: "string", format: "binary" } },
              "image/webp": { schema: { type: "string", format: "binary" } },
              "application/pdf": {
                schema: { type: "string", format: "binary" },
              },
            },
          },
          "401": errorResponse,
          "404": errorResponse,
        },
      },
    },
    "/api/receipts/{id}/submit": {
      post: {
        tags: ["Receipts"],
        operationId: "submitReceipt",
        summary: "Create an Actual transaction from a processed receipt",
        parameters: [{ $ref: "#/components/parameters/ReceiptId" }],
        requestBody: transactionBody,
        responses: {
          "201": {
            description: "Transaction created.",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/Created" },
              },
            },
          },
          "400": errorResponse,
          "401": errorResponse,
          "404": errorResponse,
          "409": errorResponse,
          "502": errorResponse,
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Use the configured Spendee API key.",
      },
      basicAuth: {
        type: "http",
        scheme: "basic",
        description: "Use the same credentials as the web application.",
      },
    },
    parameters: {
      TransactionId: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
      ReceiptId: {
        name: "id",
        in: "path",
        required: true,
        schema: { type: "integer", minimum: 1 },
      },
    },
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: { type: "string" },
          details: { type: "array", items: { type: "object" } },
        },
      },
      Created: {
        type: "object",
        required: ["id", "status"],
        properties: {
          id: { type: "string", format: "uuid" },
          status: { type: "string", enum: ["created"] },
        },
      },
      Queued: {
        type: "object",
        required: ["id", "status"],
        properties: {
          id: { type: "integer" },
          status: { type: "string", enum: ["queued"] },
        },
      },
      Reference: {
        type: "object",
        required: ["id", "name"],
        properties: {
          id: { type: "string", format: "uuid" },
          name: { type: "string" },
        },
      },
      CategoryReference: {
        allOf: [
          { $ref: "#/components/schemas/Reference" },
          {
            type: "object",
            required: ["icon", "iconId", "color"],
            properties: {
              icon: { type: "string" },
              iconId: { type: "integer", nullable: true },
              color: { type: "string" },
            },
          },
        ],
      },
      References: {
        type: "object",
        required: ["accounts", "categories", "tags"],
        properties: {
          accounts: {
            type: "array",
            items: { $ref: "#/components/schemas/Reference" },
          },
          categories: {
            type: "array",
            items: { $ref: "#/components/schemas/CategoryReference" },
          },
          tags: {
            type: "array",
            items: { $ref: "#/components/schemas/Reference" },
          },
        },
      },
      TransactionSplitInput: {
        type: "object",
        required: ["category", "amount"],
        properties: {
          category: {
            type: "string",
            format: "uuid",
            description: "Actual category ID.",
          },
          amount: { type: "number", description: "Must not be zero." },
          notes: { type: "string", maxLength: 500 },
          tags: {
            type: "array",
            maxItems: 20,
            items: { type: "string", format: "uuid" },
          },
        },
      },
      TransactionInput: {
        type: "object",
        required: ["date", "amount", "account"],
        anyOf: [{ required: ["category"] }, { required: ["splits"] }],
        properties: {
          date: { type: "string", format: "date" },
          amount: {
            type: "number",
            description:
              "Signed, non-zero major-unit amount; expenses are negative.",
          },
          account: {
            type: "string",
            format: "uuid",
            description: "Actual account ID.",
          },
          category: {
            type: "string",
            format: "uuid",
            description: "Actual category ID. Omit when using splits.",
          },
          payee: { type: "string", maxLength: 200 },
          notes: { type: "string", maxLength: 500 },
          tags: {
            type: "array",
            maxItems: 20,
            items: { type: "string", format: "uuid" },
          },
          splits: {
            type: "array",
            minItems: 2,
            items: { $ref: "#/components/schemas/TransactionSplitInput" },
          },
        },
      },
      Transaction: {
        type: "object",
        required: [
          "id",
          "date",
          "amount",
          "account",
          "category",
          "payee",
          "isSplit",
        ],
        properties: {
          id: { type: "string", format: "uuid" },
          date: { type: "string", format: "date" },
          amount: { type: "number" },
          account: { type: "string" },
          category: { type: "string" },
          payee: { type: "string" },
          notes: { type: "string" },
          isSplit: { type: "boolean" },
        },
      },
      TransactionPage: {
        type: "object",
        required: ["transactions", "page", "pageSize", "total", "pages"],
        properties: {
          transactions: {
            type: "array",
            items: { $ref: "#/components/schemas/Transaction" },
          },
          page: { type: "integer" },
          pageSize: { type: "integer" },
          total: { type: "integer" },
          pages: { type: "integer" },
        },
      },
      ReceiptItem: {
        type: "object",
        required: [
          "description",
          "quantity",
          "unitAmount",
          "totalAmount",
          "category",
        ],
        properties: {
          description: { type: "string" },
          quantity: { type: "number" },
          unitAmount: { type: "number" },
          totalAmount: { type: "number" },
          category: { type: "string", format: "uuid" },
        },
      },
      ReceiptSplitSuggestion: {
        type: "object",
        required: ["category", "amount", "notes", "tags"],
        properties: {
          category: { type: "string", format: "uuid" },
          amount: { type: "number" },
          notes: { type: "string" },
          tags: {
            type: "array",
            items: { type: "string", format: "uuid" },
          },
        },
      },
      ReceiptSuggestion: {
        type: "object",
        required: [
          "merchant",
          "date",
          "amount",
          "currency",
          "category",
          "notes",
          "tags",
          "items",
          "splits",
          "confidence",
        ],
        properties: {
          merchant: { type: "string" },
          date: { type: "string", format: "date" },
          amount: { type: "number" },
          currency: { type: "string", minLength: 3, maxLength: 3 },
          category: { type: "string", format: "uuid" },
          notes: { type: "string" },
          tags: {
            type: "array",
            items: { type: "string", format: "uuid" },
          },
          items: {
            type: "array",
            items: { $ref: "#/components/schemas/ReceiptItem" },
          },
          splits: {
            type: "array",
            items: { $ref: "#/components/schemas/ReceiptSplitSuggestion" },
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
      },
      Receipt: {
        type: "object",
        required: [
          "id",
          "filename",
          "mimeType",
          "accountId",
          "accountName",
          "status",
          "suggestion",
          "error",
          "submitted",
          "actualTransactionId",
          "createdAt",
          "processedAt",
          "submittedAt",
        ],
        properties: {
          id: { type: "integer" },
          filename: { type: "string" },
          mimeType: {
            type: "string",
            enum: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
          },
          accountId: { type: "string", format: "uuid" },
          accountName: { type: "string" },
          status: {
            type: "string",
            enum: ["queued", "processing", "processed", "failed"],
          },
          suggestion: {
            allOf: [{ $ref: "#/components/schemas/ReceiptSuggestion" }],
            nullable: true,
          },
          error: { type: "string", nullable: true },
          submitted: { type: "boolean" },
          actualTransactionId: {
            type: "string",
            format: "uuid",
            nullable: true,
          },
          createdAt: { type: "string", format: "date-time" },
          processedAt: {
            type: "string",
            format: "date-time",
            nullable: true,
          },
          submittedAt: {
            type: "string",
            format: "date-time",
            nullable: true,
          },
        },
      },
    },
  },
} as const;
