import * as XLSX from 'xlsx';
import { ParsedWorkbookData, RecipientRow } from '../types/mail';

const TARGET_SHEET_NAME = 'guiemail';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailAddress(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function parseExcelArrayBuffer(
  buffer: ArrayBuffer,
  fileName: string,
  fileSize: number
): ParsedWorkbookData {
  const workbook = XLSX.read(buffer, { type: 'array' });
  const allSheetNames = workbook.SheetNames || [];

  if (allSheetNames.length === 0) {
    throw new Error('File Excel không chứa sheet dữ liệu nào.');
  }

  // Always read data from Sheet named "guiemail" (exact first, then case-insensitive fallback)
  let matchedSheetName: string | undefined = allSheetNames.find(
    (name) => name === TARGET_SHEET_NAME
  );
  if (!matchedSheetName) {
    matchedSheetName = allSheetNames.find(
      (name) => name.trim().toLowerCase() === TARGET_SHEET_NAME
    );
  }

  if (!matchedSheetName) {
    throw new Error(
      `Không tìm thấy sheet có tên "${TARGET_SHEET_NAME}" trong file "${fileName}". Các sheet hiện có: ${allSheetNames.join(', ')}.`
    );
  }

  const worksheet = workbook.Sheets[matchedSheetName];
  const rawMatrix = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: '',
    raw: false,
  });

  if (!rawMatrix || rawMatrix.length === 0) {
    throw new Error(`Sheet "${matchedSheetName}" không có dữ liệu.`);
  }

  // Row 1 (index 0) is the column header row
  const headerRowRaw = rawMatrix[0] || [];
  let lastNonEmptyColIndex = -1;
  for (let c = headerRowRaw.length - 1; c >= 0; c--) {
    const val = String(headerRowRaw[c] ?? '').trim();
    if (val !== '') {
      lastNonEmptyColIndex = c;
      break;
    }
  }

  if (lastNonEmptyColIndex < 1) {
    throw new Error(
      'Dòng 1 của sheet "guiemail" phải có ít nhất 2 cột: các cột thông tin và cột cuối cùng là địa chỉ Email.'
    );
  }

  const headers: string[] = [];
  for (let c = 0; c <= lastNonEmptyColIndex; c++) {
    const label = String(headerRowRaw[c] ?? '').trim();
    headers.push(label || `Cột ${c + 1}`);
  }

  // Columns 0 .. N-2 are info fields; Column N-1 is always recipient email
  const infoColumns = headers.slice(0, headers.length - 1);
  const emailColumn = headers[headers.length - 1];

  const rows: RecipientRow[] = [];

  for (let r = 1; r < rawMatrix.length; r++) {
    const rowArr = rawMatrix[r] || [];
    const normalizedValues = headers.map((_, colIdx) =>
      String(rowArr[colIdx] ?? '').trim()
    );

    // Skip completely empty rows
    const hasAnyValue = normalizedValues.some((v) => v !== '');
    if (!hasAnyValue) continue;

    const email = normalizedValues[headers.length - 1];
    const valid = isValidEmailAddress(email);

    const fields: Record<string, string> = {};
    infoColumns.forEach((colName, idx) => {
      fields[colName] = normalizedValues[idx] ?? '';
    });

    rows.push({
      id: `row-${r + 1}`,
      rowNumber: r + 1,
      email,
      emailHeader: emailColumn,
      fields,
      isValidEmail: valid,
      selected: valid,
      status: valid ? 'pending' : 'invalid',
      errorMessage: valid ? undefined : 'Địa chỉ email thiếu hoặc không đúng định dạng',
    });
  }

  if (rows.length === 0) {
    throw new Error(
      `Sheet "${matchedSheetName}" chỉ có dòng tiêu đề, chưa có dòng dữ liệu người nhận nào.`
    );
  }

  return {
    fileName,
    fileSize,
    sheetName: matchedSheetName,
    allSheetNames,
    infoColumns,
    emailColumn,
    rows,
  };
}

export async function parseExcelFile(file: File): Promise<ParsedWorkbookData> {
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith('.xls') && !lowerName.endsWith('.xlsx')) {
    throw new Error('Định dạng file không hợp lệ. Vui lòng chọn file .xls hoặc .xlsx.');
  }

  const buffer = await file.arrayBuffer();
  return parseExcelArrayBuffer(buffer, file.name, file.size);
}

function buildSampleWorkbook(): XLSX.WorkBook {
  const sampleRows: (string | number)[][] = [
    ['Mã sinh viên', 'Họ và tên', 'LAB1', 'Email'],
    ['SA210101', 'Nguyễn Minh Anh', '9.0', 'minhanh.sa210101@example.edu.vn'],
    ['SA210102', 'Trần Quốc Bảo', '8.5', 'quocbao.sa210102@example.edu.vn'],
    ['SA210103', 'Lê Thị Thu Hà', '9.5', 'thuha.sa210103@example.edu.vn'],
    ['SA210104', 'Phạm Hoàng Khang', '7.5', 'hoangkhang.sa210104@example.edu.vn'],
    ['SA210105', 'Võ Ngọc Lan', '8.0', 'ngoclan.sa210105@example.edu.vn'],
    ['SA210106', 'Đặng Tuấn Minh', '10.0', 'tuanminh.sa210106@example.edu.vn'],
  ];

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(sampleRows);
  ws['!cols'] = [{ wch: 16 }, { wch: 24 }, { wch: 10 }, { wch: 34 }];
  XLSX.utils.book_append_sheet(wb, ws, TARGET_SHEET_NAME);
  return wb;
}

export function downloadSampleExcel(): void {
  const wb = buildSampleWorkbook();
  XLSX.writeFile(wb, 'SA2101.xls', { bookType: 'biff8' });
}

export function loadSampleExcelData(): ParsedWorkbookData {
  const wb = buildSampleWorkbook();
  const out = XLSX.write(wb, { bookType: 'biff8', type: 'array' }) as ArrayBuffer;
  return parseExcelArrayBuffer(out, 'SA2101.xls', out.byteLength);
}
