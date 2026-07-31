export type ExtractedDocumentTransaction = {
  date: string;
  description: string;
  amount: number;
  currency: string;
};

export type ExtractedDocument = {
  title: string;
  printDate: string | null;
  issuer: string | null;
  accountReference: string | null;
  documentCurrency: string | null;
  metadata: Record<string, string>;
  transactions: ExtractedDocumentTransaction[];
};

export type ValidationAppTransaction = {
  id: number;
  fingerprint?: string;
  date: string;
  wallet: string;
  type: string;
  categoryName: string | null;
  amount: number;
  currency: string;
  note: string | null;
};

export type ValidationMatch = {
  document: ExtractedDocumentTransaction;
  app: ValidationAppTransaction;
  manual?: boolean;
  documentKey?: string;
};

export type ValidationMatchSuggestion = {
  documentKey: string;
  document: ExtractedDocumentTransaction;
  app: ValidationAppTransaction;
};

export type ValidationDiff = {
  matching: ValidationMatch[];
  missingInApp: ExtractedDocumentTransaction[];
  missingInDocument: ValidationAppTransaction[];
};
