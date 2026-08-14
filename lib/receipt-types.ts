export type ReceiptStatus = "queued" | "processing" | "processed" | "failed";

export type ReceiptItem = {
  description: string;
  quantity: number;
  unitAmount: number;
  totalAmount: number;
  category: string;
};

export type ReceiptSplitSuggestion = {
  category: string;
  amount: number;
  notes: string;
  tags: string[];
};

export type ReceiptSuggestion = {
  merchant: string;
  date: string;
  amount: number;
  currency: string;
  category: string;
  notes: string;
  tags: string[];
  items: ReceiptItem[];
  splits: ReceiptSplitSuggestion[];
  confidence: number;
};

export type ReceiptRecord = {
  id: number;
  filename: string;
  mimeType: string;
  filePath: string;
  accountId: string;
  accountName: string;
  status: ReceiptStatus;
  suggestion: ReceiptSuggestion | null;
  error: string | null;
  submitted: boolean;
  actualTransactionId: string | null;
  createdAt: string;
  processedAt: string | null;
  submittedAt: string | null;
};

export type ReceiptApiRecord = Omit<ReceiptRecord, "filePath">;
