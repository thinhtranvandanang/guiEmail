import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Clock,
  AlertTriangle,
  Search,
  Eye,
} from 'lucide-react';
import { ParsedWorkbookData, RecipientRow, RowSendStatus } from '../types/mail';

interface RecipientTableProps {
  workbook: ParsedWorkbookData | null;
  isSending: boolean;
  onToggleRow: (id: string) => void;
  onToggleAllValid: (selectAll: boolean) => void;
  onPreviewRow: (rowIndex: number) => void;
}

type StatusFilter = 'all' | 'pending' | 'sent' | 'error';

function renderStatusCell(row: RecipientRow) {
  switch (row.status) {
    case 'sent':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
          <span>Đã gửi</span>
        </span>
      );
    case 'sending':
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 whitespace-nowrap">
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
          <span>Đang gửi</span>
        </span>
      );
    case 'error':
      return (
        <span
          className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 whitespace-nowrap"
          title={row.errorMessage}
        >
          <XCircle className="h-3.5 w-3.5 shrink-0" />
          <span>Lỗi gửi</span>
        </span>
      );
    case 'invalid':
      return (
        <span
          className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 whitespace-nowrap"
          title={row.errorMessage}
        >
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span>Email lỗi</span>
        </span>
      );
    case 'pending':
    default:
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 whitespace-nowrap">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span>Chờ gửi</span>
        </span>
      );
  }
}

export const RecipientTable: React.FC<RecipientTableProps> = ({
  workbook,
  isSending,
  onToggleRow,
  onToggleAllValid,
  onPreviewRow,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const rows = workbook?.rows || [];

  const counts = useMemo(() => {
    return rows.reduce(
      (acc, r) => {
        if (r.status === 'sent') acc.sent += 1;
        else if (r.status === 'error' || r.status === 'invalid') acc.error += 1;
        else acc.pending += 1;
        return acc;
      },
      { sent: 0, pending: 0, error: 0 }
    );
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return rows
      .map((row, originalIndex) => ({ row, originalIndex }))
      .filter(({ row }) => {
        if (statusFilter === 'sent' && row.status !== 'sent') return false;
        if (
          statusFilter === 'pending' &&
          row.status !== 'pending' &&
          row.status !== 'sending'
        )
          return false;
        if (
          statusFilter === 'error' &&
          row.status !== 'error' &&
          row.status !== 'invalid'
        )
          return false;

        if (!q) return true;
        if (row.email.toLowerCase().includes(q)) return true;
        return Object.values(row.fields).some((val) =>
          val.toLowerCase().includes(q)
        );
      });
  }, [rows, searchQuery, statusFilter]);

  const validRows = rows.filter((r) => r.isValidEmail);
  const allValidSelected =
    validRows.length > 0 && validRows.every((r) => r.selected);

  if (!workbook) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm font-semibold text-slate-900">
          Chưa có bảng dữ liệu người nhận
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Dữ liệu từ sheet <span className="font-mono">guiemail</span> sẽ hiển thị tại đây sau khi bạn tải lên file Excel.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-3.5">
        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
          {(
            [
              { key: 'all', label: `Tất cả (${rows.length})` },
              { key: 'pending', label: `Chờ gửi (${counts.pending})` },
              { key: 'sent', label: `Đã gửi (${counts.sent})` },
              { key: 'error', label: `Lỗi (${counts.error})` },
            ] as { key: StatusFilter; label: string }[]
          ).map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusFilter(tab.key)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap shrink-0 tabular-nums ${
                statusFilter === tab.key
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm mã SV, họ tên, email..."
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
          />
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600">
              <th className="w-10 px-4 py-2.5">
                <input
                  type="checkbox"
                  checked={allValidSelected}
                  disabled={isSending || validRows.length === 0}
                  onChange={(e) => onToggleAllValid(e.target.checked)}
                  aria-label="Chọn tất cả người nhận hợp lệ"
                  className="h-3.5 w-3.5 rounded border-slate-300 text-blue-700 focus:ring-blue-700"
                />
              </th>
              <th className="w-12 px-3 py-2.5 font-semibold tabular-nums">#</th>
              {workbook.infoColumns.map((col) => (
                <th key={col} className="px-3 py-2.5 font-semibold whitespace-nowrap">
                  {col}
                </th>
              ))}
              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">
                {workbook.emailColumn}
              </th>
              <th className="px-3 py-2.5 font-semibold whitespace-nowrap">
                Trạng thái
              </th>
              <th className="px-4 py-2.5 text-right font-semibold whitespace-nowrap">
                Xem
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={workbook.infoColumns.length + 5}
                  className="px-4 py-8 text-center text-xs text-slate-500"
                >
                  Không tìm thấy dòng dữ liệu nào phù hợp với bộ lọc.
                </td>
              </tr>
            ) : (
              filteredRows.map(({ row, originalIndex }) => (
                <tr
                  key={row.id}
                  className={`transition-colors hover:bg-slate-50/80 ${
                    row.status === 'sending' ? 'bg-blue-50/40' : ''
                  }`}
                >
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={row.selected}
                      disabled={isSending || !row.isValidEmail}
                      onChange={() => onToggleRow(row.id)}
                      aria-label={`Chọn dòng ${originalIndex + 1}`}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-blue-700 focus:ring-blue-700 disabled:opacity-40"
                    />
                  </td>
                  <td className="px-3 py-2.5 font-mono tabular-nums text-slate-400">
                    {originalIndex + 1}
                  </td>
                  {workbook.infoColumns.map((col) => (
                    <td
                      key={col}
                      className="px-3 py-2.5 text-slate-800 whitespace-nowrap max-w-[200px] truncate"
                    >
                      {row.fields[col] || '—'}
                    </td>
                  ))}
                  <td className="px-3 py-2.5 font-mono text-slate-700 whitespace-nowrap max-w-[230px] truncate">
                    {row.email || '—'}
                  </td>
                  <td className="px-3 py-2.5">
                    <div>
                      {renderStatusCell(row)}
                      {row.errorMessage &&
                        (row.status === 'error' || row.status === 'invalid') && (
                          <p className="mt-0.5 max-w-[210px] truncate text-[11px] text-slate-500" title={row.errorMessage}>
                            {row.errorMessage}
                          </p>
                        )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <button
                      type="button"
                      onClick={() => onPreviewRow(originalIndex)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-50 whitespace-nowrap"
                    >
                      <Eye className="h-3.5 w-3.5" />
                      <span>Xem</span>
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
