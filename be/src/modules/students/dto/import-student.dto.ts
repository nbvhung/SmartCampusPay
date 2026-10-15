export interface ImportStudentRow {
  studentCode: string;
  cardUid: string;
  fullName?: string;
  email?: string;
  faculty?: string;
  phone?: string;
  rowNumber: number;
}

export interface BulkImportResult {
  created: number;
  skipped: number;
  errors: Array<{ row: number; studentCode: string; reason: string }>;
}
