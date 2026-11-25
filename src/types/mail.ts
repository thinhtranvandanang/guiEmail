export type RowSendStatus = 'pending' | 'sending' | 'sent' | 'error' | 'invalid';

export interface RecipientRow {
  id: string;
  rowNumber: number; // 1-based Excel row number (data starts at row 2)
  email: string;
  emailHeader: string;
  fields: Record<string, string>; // Keyed by header name (columns 0 to N-2)
  isValidEmail: boolean;
  selected: boolean;
  status: RowSendStatus;
  errorMessage?: string;
  sentAt?: string;
  gmailMessageId?: string;
}

export interface ParsedWorkbookData {
  fileName: string;
  fileSize: number;
  sheetName: string;
  allSheetNames: string[];
  infoColumns: string[]; // Columns 0 .. N-2
  emailColumn: string; // Last column N-1
  rows: RecipientRow[];
}

export interface EmailConfig {
  subject: string;
  greeting: string;
  introText: string;
  tableHeading: string;
  tableLayout: 'vertical' | 'horizontal';
  feedbackDeadline: string;
  feedbackNote: string;
  signatureName: string;
  signatureRole: string;
  signatureContact: string;
  logoMode: 'none' | 'upload' | 'url';
  logoDataUrl: string; // Base64 data URL when uploaded
  logoUrl: string; // HTTPS URL when URL mode
  logoAlt: string;
}
