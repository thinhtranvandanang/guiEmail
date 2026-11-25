import React, { useEffect } from 'react';
import { MailCheck, X, AlertCircle } from 'lucide-react';
import { RecipientRow } from '../types/mail';
import { interpolateTemplate } from '../utils/emailBuilder';

interface ConfirmSendModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  senderEmail: string;
  subjectTemplate: string;
  recipients: RecipientRow[];
}

export const ConfirmSendModal: React.FC<ConfirmSendModalProps> = ({
  isOpen,
  onCancel,
  onConfirm,
  senderEmail,
  subjectTemplate,
  recipients,
}) => {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const previewList = recipients.slice(0, 5);
  const remainingCount = Math.max(0, recipients.length - previewList.length);
  const sampleSubject =
    recipients.length > 0
      ? interpolateTemplate(subjectTemplate, recipients[0])
      : subjectTemplate;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-send-title"
    >
      <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
              <MailCheck className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="confirm-send-title"
                className="text-base font-semibold text-slate-900"
              >
                Xác nhận gửi {recipients.length} email hàng loạt
              </h2>
              <p className="text-xs text-slate-500">
                Hành động này sẽ gửi email trực tiếp qua tài khoản Gmail của bạn.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="Đóng hộp thoại"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5 text-sm">
          <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-3.5">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-xs font-medium text-slate-500 shrink-0">
                Tài khoản gửi
              </span>
              <span className="font-mono text-xs font-medium text-slate-900 truncate">
                {senderEmail}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-slate-200 pt-2">
              <span className="text-xs font-medium text-slate-500 shrink-0">
                Số lượng người nhận
              </span>
              <span className="font-mono text-xs font-semibold tabular-nums text-blue-700">
                {recipients.length} email
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-slate-200 pt-2">
              <span className="text-xs font-medium text-slate-500 shrink-0">
                Tiêu đề mẫu
              </span>
              <span className="text-xs font-medium text-slate-900 truncate max-w-[300px]">
                {sampleSubject || '(Không có tiêu đề)'}
              </span>
            </div>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-slate-600">
              Danh sách người nhận sẽ được gửi lần lượt:
            </p>
            <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
              {previewList.map((row) => {
                const firstVal = Object.values(row.fields)[0] || `Dòng ${row.rowNumber}`;
                return (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                  >
                    <span className="font-medium text-slate-800 truncate">
                      {firstVal}
                    </span>
                    <span className="font-mono text-slate-500 truncate">
                      {row.email}
                    </span>
                  </div>
                );
              })}
              {remainingCount > 0 && (
                <div className="bg-slate-50 px-3 py-2 text-center text-xs text-slate-500">
                  và {remainingCount} người nhận khác trong danh sách đã chọn
                </div>
              )}
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2.5 text-xs text-amber-900">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <span>
              Email sau khi gửi đi không thể thu hồi. Bạn có thể tạm dừng hoặc dừng giữa chừng trong khi hệ thống đang xử lý từng dòng.
            </span>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            Hủy
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-blue-800 whitespace-nowrap shrink-0"
          >
            Xác nhận gửi {recipients.length} email
          </button>
        </div>
      </div>
    </div>
  );
};
