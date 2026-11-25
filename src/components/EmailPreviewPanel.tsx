import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Eye } from 'lucide-react';
import { EmailConfig, ParsedWorkbookData } from '../types/mail';
import { buildEmailHtml, interpolateTemplate } from '../utils/emailBuilder';

interface EmailPreviewPanelProps {
  workbook: ParsedWorkbookData | null;
  config: EmailConfig;
  senderEmail: string | null;
  previewIndex: number;
  onChangePreviewIndex: (idx: number) => void;
}

export const EmailPreviewPanel: React.FC<EmailPreviewPanelProps> = ({
  workbook,
  config,
  senderEmail,
  previewIndex,
  onChangePreviewIndex,
}) => {
  const rows = workbook?.rows || [];
  const safeIndex =
    rows.length > 0 ? Math.min(Math.max(0, previewIndex), rows.length - 1) : 0;
  const currentRow = rows[safeIndex] || null;

  const resolvedSubject = useMemo(() => {
    if (!currentRow) return config.subject;
    return interpolateTemplate(config.subject, currentRow);
  }, [config.subject, currentRow]);

  const htmlPreview = useMemo(() => {
    if (!currentRow || !workbook) return '';
    return buildEmailHtml(currentRow, workbook.infoColumns, config, false);
  }, [currentRow, workbook, config]);

  if (!workbook || !currentRow) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center">
        <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-400">
          <Eye className="h-5 w-5" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900">
          Chưa có dữ liệu để xem trước email
        </h3>
        <p className="mt-1 max-w-sm text-xs leading-relaxed text-slate-500">
          Hãy tải lên file Excel (.xls hoặc .xlsx) có sheet <span className="font-mono font-medium text-slate-700">guiemail</span> hoặc nạp dữ liệu mẫu <span className="font-mono font-medium text-slate-700">SA2101.xls</span> để xem trước nội dung email cá nhân hóa cho từng người nhận.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-5 py-3">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <span className="font-semibold text-slate-900">Xem trước theo dòng</span>
          <span aria-hidden="true">·</span>
          <span className="font-mono tabular-nums text-slate-500">
            {safeIndex + 1} / {rows.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <select
            aria-label="Chọn người nhận để xem trước"
            value={safeIndex}
            onChange={(e) => onChangePreviewIndex(Number(e.target.value))}
            className="max-w-[230px] rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-blue-700 focus:outline-none"
          >
            {rows.map((r, idx) => {
              const labelParts = workbook.infoColumns
                .slice(0, 2)
                .map((col) => r.fields[col])
                .filter(Boolean)
                .join(' — ');
              return (
                <option key={r.id} value={idx}>
                  #{idx + 1}: {labelParts || r.email}
                </option>
              );
            })}
          </select>

          <div className="flex items-center rounded-md border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => onChangePreviewIndex(Math.max(0, safeIndex - 1))}
              disabled={safeIndex === 0}
              className="p-1.5 text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40"
              aria-label="Người nhận trước"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="h-4 w-px bg-slate-200" />
            <button
              type="button"
              onClick={() =>
                onChangePreviewIndex(Math.min(rows.length - 1, safeIndex + 1))
              }
              disabled={safeIndex >= rows.length - 1}
              className="p-1.5 text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-40"
              aria-label="Người nhận tiếp theo"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-1.5 border-b border-slate-200 px-5 py-3.5 text-xs">
        <div className="flex items-baseline gap-3">
          <span className="w-16 shrink-0 text-slate-400">Từ:</span>
          <span className="font-mono text-slate-700 truncate">
            {senderEmail || 'Chưa đăng nhập Gmail'}
          </span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="w-16 shrink-0 text-slate-400">Đến:</span>
          <span
            className={`font-mono truncate ${
              currentRow.isValidEmail ? 'text-slate-900 font-medium' : 'text-amber-700 font-medium'
            }`}
          >
            {currentRow.email || '(Trống)'}
          </span>
        </div>
        <div className="flex items-baseline gap-3">
          <span className="w-16 shrink-0 text-slate-400">Tiêu đề:</span>
          <span className="font-semibold text-slate-900 break-words">
            {resolvedSubject || '(Chưa nhập tiêu đề)'}
          </span>
        </div>
      </div>

      <div className="bg-slate-100">
        <iframe
          title="Xem trước nội dung Email"
          srcDoc={htmlPreview}
          sandbox=""
          className="h-[520px] w-full border-0 bg-slate-100"
        />
      </div>
    </div>
  );
};
