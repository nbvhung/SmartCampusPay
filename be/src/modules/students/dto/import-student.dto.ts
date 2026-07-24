export interface ImportStudentRow {
  studentCode: string;
  fullName: string;
  email: string;
  phone?: string;
  faculty?: string;
  dateOfBirth: string; // dd/mm/yyyy hoặc Date từ Excel
}

export interface BulkImportResult {
  created: number;
  skipped: number;
  errors: Array<{ row: number; studentCode: string; reason: string }>;
}
