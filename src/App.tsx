import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { User } from 'firebase/auth';
import {
  Upload,
  FileSpreadsheet,
  Download,
  Send,
  Pause,
  Play,
  Square,
  RotateCcw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Image as ImageIcon,
  Trash2,
  LogOut,
  Mail,
  RefreshCw,
} from 'lucide-react';
import {
  EmailConfig,
  ParsedWorkbookData,
  RecipientRow,
} from './types/mail';
import {
  initAuth,
  googleSignIn,
  getAccessToken,
  clearCachedToken,
  logout,
} from './services/gmailAuth';
import {
  GmailAuthExpiredError,
  GmailInsufficientScopeError,
  sendSingleGmailMessage,
} from './services/gmailSender';
import {
  downloadSampleExcel,
  loadSampleExcelData,
  parseExcelFile,
} from './utils/excelParser';
import {
  buildEmailHtml,
  buildGmailRawMessage,
  interpolateTemplate,
} from './utils/emailBuilder';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { ConfirmSendModal } from './components/ConfirmSendModal';
import { EmailPreviewPanel } from './components/EmailPreviewPanel';
import { RecipientTable } from './components/RecipientTable';

type RightTab = 'preview' | 'recipients';
type ActiveFieldTarget = 'subject' | 'greeting' | 'introText';

const DEFAULT_CONFIG: EmailConfig = {
  subject: 'Thông báo kết quả học tập - {{Họ và tên}} ({{Mã sinh viên}})',
  greeting: 'Thân gửi bạn {{Họ và tên}},',
  introText:
    'Giảng viên gửi đến bạn thông tin kết quả điểm thành phần mới nhất như chi tiết dưới đây:',
  tableHeading: 'Thông tin kết quả chi tiết',
  tableLayout: 'vertical',
  feedbackDeadline: '17:00 ngày 30/11/2026',
  feedbackNote:
    'Nếu có bất kỳ thắc mắc hoặc sai sót nào về thông tin, bạn vui lòng phản hồi trực tiếp qua email này trước thời hạn trên để được kiểm tra và hỗ trợ.',
  signatureName: 'Phòng Đào tạo & Giảng viên bộ môn',
  signatureRole: 'Hỗ trợ học vụ sinh viên',
  signatureContact: 'Email phản hồi trực tiếp qua hộp thư này',
  logoMode: 'none',
  logoDataUrl: '',
  logoUrl: '',
  logoAlt: 'Logo đơn vị',
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function App() {
  // Auth state
  const [user, setUser] = useState<User | null>(null);
  const [needsAuth, setNeedsAuth] = useState<boolean>(true);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Excel workbook state
  const [workbook, setWorkbook] = useState<ParsedWorkbookData | null>(null);
  const [excelError, setExcelError] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState<boolean>(false);

  // Email composition state
  const [config, setConfig] = useState<EmailConfig>(DEFAULT_CONFIG);
  const [activeField, setActiveField] = useState<ActiveFieldTarget>('greeting');

  // Workspace view state
  const [rightTab, setRightTab] = useState<RightTab>('preview');
  const [previewIndex, setPreviewIndex] = useState<number>(0);

  // Sending & Progress state
  const [isConfirmOpen, setIsConfirmOpen] = useState<boolean>(false);
  const [isSending, setIsSending] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [sendBatchTotal, setSendBatchTotal] = useState<number>(0);
  const [sendBatchCompleted, setSendBatchCompleted] = useState<number>(0);
  const [sendBatchSuccess, setSendBatchSuccess] = useState<number>(0);
  const [sendBatchFailed, setSendBatchFailed] = useState<number>(0);
  const [currentSendingTarget, setCurrentSendingTarget] = useState<string>('');
  const [sendBannerMessage, setSendBannerMessage] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  const isPausedRef = useRef<boolean>(false);
  const shouldStopRef = useRef<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const unsubscribe = initAuth(
      (authedUser) => {
        setUser(authedUser);
        setNeedsAuth(false);
        setAuthError(null);
      },
      (existingUser) => {
        setUser(existingUser);
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setAuthError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setNeedsAuth(false);
        setConfig((prev) => {
          if (
            prev.signatureName === DEFAULT_CONFIG.signatureName &&
            result.user.displayName
          ) {
            return {
              ...prev,
              signatureName: result.user.displayName,
              signatureContact: result.user.email || prev.signatureContact,
            };
          }
          return prev;
        });
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Đăng nhập Gmail thất bại. Vui lòng thử lại.';
      setAuthError(message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    await logout();
    setUser(null);
    setNeedsAuth(true);
  };

  const applyParsedWorkbook = useCallback((parsed: ParsedWorkbookData) => {
    setWorkbook(parsed);
    setExcelError(null);
    setPreviewIndex(0);
    setSendBatchTotal(0);
    setSendBatchCompleted(0);
    setSendBatchSuccess(0);
    setSendBatchFailed(0);
    setCurrentSendingTarget('');
    setSendBannerMessage(null);

    // Smartly update default subject/greeting placeholders if the uploaded sheet uses custom column names
    if (parsed.infoColumns.length > 0) {
      const colNames = parsed.infoColumns;
      const hasName = colNames.some((c) => c.toLowerCase().includes('tên'));
      const hasId = colNames.some((c) => c.toLowerCase().includes('mã'));
      if (!hasName && !hasId) {
        const firstCol = colNames[0];
        setConfig((prev) => ({
          ...prev,
          subject:
            prev.subject === DEFAULT_CONFIG.subject
              ? `Thông báo thông tin - {{${firstCol}}}`
              : prev.subject,
          greeting:
            prev.greeting === DEFAULT_CONFIG.greeting
              ? `Thân gửi {{${firstCol}}},`
              : prev.greeting,
        }));
      }
    }
  }, []);

  const handleExcelFile = async (file: File) => {
    setExcelError(null);
    try {
      const parsed = await parseExcelFile(file);
      applyParsedWorkbook(parsed);
    } catch (err: unknown) {
      setExcelError(
        err instanceof Error
          ? err.message
          : 'Không thể đọc file Excel. Vui lòng kiểm tra định dạng và sheet guiemail.'
      );
    }
  };

  const handleLoadSample = () => {
    try {
      const sample = loadSampleExcelData();
      applyParsedWorkbook(sample);
    } catch (err: unknown) {
      setExcelError(
        err instanceof Error ? err.message : 'Không thể nạp dữ liệu mẫu.'
      );
    }
  };

  const handleLogoUpload = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setSendBannerMessage({
        type: 'error',
        text: 'Vui lòng chọn tệp hình ảnh hợp lệ (.png, .jpg, .svg, .webp) làm logo.',
      });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setSendBannerMessage({
        type: 'error',
        text: 'Dung lượng logo tối đa 2MB để đảm bảo gửi email ổn định.',
      });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setConfig((prev) => ({
          ...prev,
          logoMode: 'upload',
          logoDataUrl: reader.result as string,
        }));
      }
    };
    reader.readAsDataURL(file);
  };

  const insertPlaceholder = (columnName: string) => {
    const token = `{{${columnName}}}`;
    setConfig((prev) => ({
      ...prev,
      [activeField]: prev[activeField] ? `${prev[activeField]} ${token}` : token,
    }));
  };

  const handleToggleRow = (rowId: string) => {
    setWorkbook((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        rows: prev.rows.map((r) =>
          r.id === rowId && r.isValidEmail ? { ...r, selected: !r.selected } : r
        ),
      };
    });
  };

  const handleToggleAllValid = (selectAll: boolean) => {
    setWorkbook((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        rows: prev.rows.map((r) =>
          r.isValidEmail ? { ...r, selected: selectAll } : r
        ),
      };
    });
  };

  // Eligible recipients for the next send run (selected, valid email, and not already sent)
  const pendingSelectedRecipients = useMemo(() => {
    if (!workbook) return [];
    return workbook.rows.filter(
      (r) => r.selected && r.isValidEmail && r.status !== 'sent'
    );
  }, [workbook]);

  const failedRows = useMemo(() => {
    if (!workbook) return [];
    return workbook.rows.filter((r) => r.status === 'error' && r.isValidEmail);
  }, [workbook]);

  const stats = useMemo(() => {
    const rows = workbook?.rows || [];
    const total = rows.length;
    const valid = rows.filter((r) => r.isValidEmail).length;
    const selected = rows.filter((r) => r.selected && r.isValidEmail).length;
    const sent = rows.filter((r) => r.status === 'sent').length;
    const failed = rows.filter((r) => r.status === 'error').length;
    return { total, valid, selected, sent, failed };
  }, [workbook]);

  const updateRowStatus = useCallback(
    (rowId: string, patch: Partial<RecipientRow>) => {
      setWorkbook((prev) => {
        if (!prev) return null;
        return {
          ...prev,
          rows: prev.rows.map((r) => (r.id === rowId ? { ...r, ...patch } : r)),
        };
      });
    },
    []
  );

  const executeBatchSend = async (targets: RecipientRow[]) => {
    if (!workbook || targets.length === 0) return;

    const token = await getAccessToken();
    if (!token || !user?.email) {
      setNeedsAuth(true);
      setSendBannerMessage({
        type: 'warning',
        text: 'Vui lòng đăng nhập lại tài khoản Gmail trước khi gửi email.',
      });
      return;
    }

    setIsSending(true);
    setIsPaused(false);
    isPausedRef.current = false;
    shouldStopRef.current = false;

    setSendBatchTotal(targets.length);
    setSendBatchCompleted(0);
    setSendBatchSuccess(0);
    setSendBatchFailed(0);
    setSendBannerMessage(null);
    setRightTab('recipients');

    let successCount = 0;
    let failCount = 0;
    let processedCount = 0;
    let stoppedByUser = false;
    let authExpired = false;
    let scopeInsufficient = false;

    const useCidLogo = config.logoMode === 'upload' && Boolean(config.logoDataUrl);

    for (const target of targets) {
      // Handle pause loop
      while (isPausedRef.current && !shouldStopRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 250));
      }

      if (shouldStopRef.current) {
        stoppedByUser = true;
        break;
      }

      const displayLabel =
        workbook.infoColumns
          .map((c) => target.fields[c])
          .filter(Boolean)
          .slice(0, 2)
          .join(' — ') || target.email;

      setCurrentSendingTarget(`${displayLabel} (${target.email})`);
      updateRowStatus(target.id, { status: 'sending', errorMessage: undefined });

      try {
        const subject =
          interpolateTemplate(config.subject, target).trim() ||
          'Thông báo từ hệ thống';
        const htmlBody = buildEmailHtml(
          target,
          workbook.infoColumns,
          config,
          useCidLogo
        );

        const raw = buildGmailRawMessage({
          fromEmail: user.email,
          fromName: config.signatureName || user.displayName || undefined,
          toEmail: target.email,
          subject,
          htmlBody,
          logoDataUrl: useCidLogo ? config.logoDataUrl : undefined,
        });

        const result = await sendSingleGmailMessage(token, raw);

        successCount += 1;
        setSendBatchSuccess(successCount);
        updateRowStatus(target.id, {
          status: 'sent',
          sentAt: new Date().toLocaleTimeString('vi-VN'),
          gmailMessageId: result.id,
          errorMessage: undefined,
        });
      } catch (err: unknown) {
        if (err instanceof GmailAuthExpiredError) {
          authExpired = true;
          clearCachedToken();
          setNeedsAuth(true);
          updateRowStatus(target.id, {
            status: 'pending',
            errorMessage: undefined,
          });
          break;
        }

        if (err instanceof GmailInsufficientScopeError) {
          scopeInsufficient = true;
          clearCachedToken();
          setNeedsAuth(true);
          updateRowStatus(target.id, {
            status: 'pending',
            errorMessage: undefined,
          });
          break;
        }

        failCount += 1;
        setSendBatchFailed(failCount);
        const msg =
          err instanceof Error ? err.message : 'Lỗi không xác định khi gửi Gmail.';
        updateRowStatus(target.id, {
          status: 'error',
          errorMessage: msg,
        });
      }

      processedCount += 1;
      setSendBatchCompleted(processedCount);

      // Gentle delay between emails so progress bar updates visibly and Gmail rate limits are respected
      if (processedCount < targets.length && !shouldStopRef.current) {
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }

    setIsSending(false);
    setIsPaused(false);
    isPausedRef.current = false;
    setCurrentSendingTarget('');

    if (scopeInsufficient) {
      setSendBannerMessage({
        type: 'warning',
        text: 'Tài khoản chưa được cấp quyền gửi email Gmail. Hãy bấm Đăng nhập bằng Gmail và tích chọn ô "Gửi email thay mặt bạn" trên màn hình Google.',
      });
    } else if (authExpired) {
      setSendBannerMessage({
        type: 'warning',
        text: 'Phiên truy cập Gmail đã hết hạn giữa chừng. Hãy đăng nhập lại để tiếp tục gửi những dòng còn lại.',
      });
    } else if (stoppedByUser) {
      setSendBannerMessage({
        type: 'warning',
        text: `Đã dừng tiến trình gửi. Đã gửi thành công ${successCount} email, thất bại ${failCount} email.`,
      });
    } else if (failCount > 0) {
      setSendBannerMessage({
        type: 'warning',
        text: `Hoàn tất lượt gửi: ${successCount} thành công, ${failCount} thất bại. Bạn có thể bấm "Gửi lại email lỗi" để thử lại.`,
      });
    } else {
      setSendBannerMessage({
        type: 'success',
        text: `Đã gửi thành công toàn bộ ${successCount} email qua Gmail (${user.email}).`,
      });
    }
  };

  const handleOpenSendConfirmation = () => {
    if (needsAuth || !user?.email) {
      setSendBannerMessage({
        type: 'warning',
        text: 'Vui lòng đăng nhập Gmail trước khi gửi email.',
      });
      return;
    }
    if (!workbook || pendingSelectedRecipients.length === 0) {
      setSendBannerMessage({
        type: 'warning',
        text: 'Không có người nhận hợp lệ nào đang ở trạng thái chờ gửi.',
      });
      return;
    }
    if (!config.subject.trim()) {
      setSendBannerMessage({
        type: 'warning',
        text: 'Vui lòng nhập Tiêu đề email (Subject) trước khi gửi.',
      });
      return;
    }
    setIsConfirmOpen(true);
  };

  const handleConfirmSend = () => {
    setIsConfirmOpen(false);
    void executeBatchSend(pendingSelectedRecipients);
  };

  const handleRetryFailed = () => {
    if (failedRows.length === 0 || isSending) return;
    // Reset failed rows back to pending and run
    setWorkbook((prev) => {
      if (!prev) return null;
      return {
        ...prev,
        rows: prev.rows.map((r) =>
          r.status === 'error'
            ? { ...r, status: 'pending', errorMessage: undefined }
            : r
        ),
      };
    });
    void executeBatchSend(failedRows);
  };

  const handleTogglePause = () => {
    const nextPaused = !isPaused;
    setIsPaused(nextPaused);
    isPausedRef.current = nextPaused;
  };

  const handleStopSending = () => {
    shouldStopRef.current = true;
    isPausedRef.current = false;
    setIsPaused(false);
  };

  const progressPercent =
    sendBatchTotal > 0
      ? Math.round((sendBatchCompleted / sendBatchTotal) * 100)
      : 0;

  const canStartSending =
    !isSending &&
    !needsAuth &&
    Boolean(user?.email) &&
    pendingSelectedRecipients.length > 0 &&
    Boolean(config.subject.trim());

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      {/* Top Bar Contract: 3 zones — Wordmark, single-line nav links, 1 primary action */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-8 px-6 py-3.5">
          <a
            href="#top"
            className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            MailSheet Studio
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <a
              href="#excel-source"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Nguồn Excel
            </a>
            <a
              href="#composer"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Soạn Email
            </a>
            <button
              type="button"
              onClick={() => setRightTab('preview')}
              className={`transition-colors whitespace-nowrap shrink-0 ${
                rightTab === 'preview'
                  ? 'text-blue-700 font-semibold'
                  : 'hover:text-slate-900'
              }`}
            >
              Xem trước
            </button>
            <button
              type="button"
              onClick={() => setRightTab('recipients')}
              className={`transition-colors whitespace-nowrap shrink-0 ${
                rightTab === 'recipients'
                  ? 'text-blue-700 font-semibold'
                  : 'hover:text-slate-900'
              }`}
            >
              Danh sách gửi
            </button>
          </nav>

          <div className="flex items-center gap-3 shrink-0">
            {!needsAuth && user ? (
              <div className="flex items-center gap-3">
                <span className="hidden sm:inline font-mono text-xs text-slate-600 max-w-[200px] truncate">
                  {user.email}
                </span>
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={isSending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Đăng xuất</span>
                </button>
              </div>
            ) : (
              <GoogleSignInButton
                onClick={handleLogin}
                loading={isLoggingIn}
                label="Đăng nhập Gmail"
              />
            )}
          </div>
        </div>
      </header>

      <main id="top" className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 lg:py-8">
        {/* Page Title & Context */}
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
              Gửi email hàng loạt từ Excel
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Đọc tự động sheet <span className="font-mono font-medium text-slate-800">guiemail</span>, cá nhân hóa nội dung từng dòng và gửi lần lượt qua Gmail.
            </p>
          </div>

          {workbook && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-mono font-medium text-slate-800">
                {workbook.fileName}
              </span>
              <span aria-hidden="true">·</span>
              <span>Sheet {workbook.sheetName}</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">{stats.total} dòng</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums">
                {workbook.infoColumns.length} cột thông tin
              </span>
            </div>
          )}
        </div>

        {/* Main 2-Column Workspace */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* Left Column: Setup & Email Composer */}
          <div className="space-y-6 lg:col-span-5">
            {/* 01. Gmail Account Connection */}
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    1. Tài khoản Gmail gửi thư
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Email sẽ được gửi trực tiếp từ hộp thư Gmail của bạn.
                  </p>
                </div>
                {!needsAuth && user && (
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 whitespace-nowrap shrink-0">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Đã kết nối</span>
                  </span>
                )}
              </div>

              <div className="mt-4">
                {!needsAuth && user ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {user.photoURL ? (
                        <img
                          src={user.photoURL}
                          alt={user.displayName || 'Ảnh đại diện Gmail'}
                          referrerPolicy="no-referrer"
                          className="h-9 w-9 rounded-full border border-slate-200 object-cover shrink-0"
                        />
                      ) : (
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-700 text-xs font-semibold text-white">
                          {(user.email || 'G')[0].toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {user.displayName || 'Tài khoản Gmail'}
                        </p>
                        <p className="truncate font-mono text-xs text-slate-600">
                          {user.email}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={handleLogin}
                      disabled={isSending || isLoggingIn}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:opacity-50 whitespace-nowrap shrink-0"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      <span>Đổi tài khoản</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <p className="text-xs leading-relaxed text-slate-600">
                      {user?.email
                        ? `Tài khoản ${user.email} cần xác thực lại phiên làm việc để cấp quyền gửi email.`
                        : 'Đăng nhập bằng tài khoản Google/Gmail để cấp quyền gửi email thay mặt bạn.'}
                    </p>
                    <p className="text-[11px] leading-relaxed text-slate-500">
                      Lưu ý: Khi cửa sổ Google hiện ra, vui lòng tích chọn ô cho phép gửi email qua Gmail trước khi bấm Tiếp tục.
                    </p>
                    <GoogleSignInButton
                      onClick={handleLogin}
                      loading={isLoggingIn}
                      label={
                        user?.email
                          ? 'Cấp quyền & Đăng nhập lại'
                          : 'Đăng nhập bằng Gmail'
                      }
                    />
                  </div>
                )}

                {authError && (
                  <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
                    <span>{authError}</span>
                  </div>
                )}
              </div>
            </section>

            {/* 02. Excel File Upload */}
            <section
              id="excel-source"
              className="rounded-xl border border-slate-200 bg-white p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    2. Tải lên file Excel (.xls / .xlsx)
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    Luôn đọc sheet <span className="font-mono font-medium text-slate-700">guiemail</span> · Dòng 1 là tiêu đề · Cột cuối là Email.
                  </p>
                </div>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(true);
                }}
                onDragLeave={() => setIsDraggingFile(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingFile(false);
                  const droppedFile = e.dataTransfer.files?.[0];
                  if (droppedFile) void handleExcelFile(droppedFile);
                }}
                className={`mt-4 rounded-lg border border-dashed p-5 text-center transition-colors ${
                  isDraggingFile
                    ? 'border-blue-700 bg-blue-50/50'
                    : 'border-slate-300 bg-slate-50/60 hover:border-slate-400'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xls,.xlsx"
                  className="hidden"
                  onChange={(e) => {
                    const selectedFile = e.target.files?.[0];
                    if (selectedFile) void handleExcelFile(selectedFile);
                    e.target.value = '';
                  }}
                />

                <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600">
                  <Upload className="h-5 w-5" />
                </div>

                <p className="text-sm font-medium text-slate-800">
                  Kéo thả file Excel vào đây hoặc{' '}
                  <button
                    type="button"
                    disabled={isSending}
                    onClick={() => fileInputRef.current?.click()}
                    className="font-semibold text-blue-700 underline-offset-2 hover:underline disabled:opacity-50"
                  >
                    chọn file từ máy
                  </button>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Hỗ trợ .xls, .xlsx · Bắt buộc có sheet tên <span className="font-mono">guiemail</span>
                </p>
              </div>

              {/* Sample File Controls */}
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                <button
                  type="button"
                  onClick={handleLoadSample}
                  disabled={isSending}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
                >
                  <FileSpreadsheet className="h-3.5 w-3.5 text-blue-700" />
                  <span>Nạp dữ liệu mẫu SA2101.xls</span>
                </button>

                <button
                  type="button"
                  onClick={downloadSampleExcel}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900 whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Tải file mẫu SA2101.xls</span>
                </button>
              </div>

              {excelError && (
                <div className="mt-3 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800">
                  <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
                  <span>{excelError}</span>
                </div>
              )}

              {workbook && !excelError && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-slate-800">
                      Đã nạp: <span className="font-mono">{workbook.fileName}</span>
                    </span>
                    <span className="font-mono text-slate-500 tabular-nums">
                      {formatFileSize(workbook.fileSize)}
                    </span>
                  </div>
                  <p className="mt-1 text-slate-600">
                    Cột thông tin: <span className="font-mono text-slate-800">{workbook.infoColumns.join(', ')}</span>
                    <span aria-hidden="true"> · </span>
                    Cột nhận email: <span className="font-mono font-semibold text-blue-700">{workbook.emailColumn}</span>
                  </p>
                </div>
              )}
            </section>

            {/* 03. Email Content Configuration */}
            <section
              id="composer"
              className="rounded-xl border border-slate-200 bg-white p-5"
            >
              <div className="mb-4">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  3. Cấu hình nội dung Email
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Cá nhân hóa tiêu đề, lời chào, thời hạn phản hồi và chữ ký / logo.
                </p>
              </div>

              {/* Dynamic Variable Insertion Toolbar */}
              {workbook && workbook.infoColumns.length > 0 && (
                <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2 text-xs">
                    <span className="font-medium text-slate-700">
                      Chèn nhanh biến cột vào{' '}
                      <span className="font-semibold text-blue-700">
                        {activeField === 'subject'
                          ? 'Tiêu đề'
                          : activeField === 'greeting'
                          ? 'Lời chào'
                          : 'Lời mở đầu'}
                      </span>
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Bấm để chèn
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {workbook.infoColumns.map((col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => insertPlaceholder(col)}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-[11px] font-medium text-slate-700 transition-colors hover:border-blue-700 hover:text-blue-700"
                      >
                        + {`{{${col}}}`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-4">
                {/* Subject */}
                <div>
                  <label
                    htmlFor="email-subject"
                    className="mb-1.5 block text-xs font-semibold text-slate-700"
                  >
                    Tiêu đề email (Subject) <span className="text-red-600">*</span>
                  </label>
                  <input
                    id="email-subject"
                    type="text"
                    value={config.subject}
                    onFocus={() => setActiveField('subject')}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, subject: e.target.value }))
                    }
                    placeholder="VD: Thông báo điểm LAB1 - {{Họ và tên}}"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
                  />
                </div>

                {/* Greeting */}
                <div>
                  <label
                    htmlFor="email-greeting"
                    className="mb-1.5 block text-xs font-semibold text-slate-700"
                  >
                    Tùy biến lời chào
                  </label>
                  <input
                    id="email-greeting"
                    type="text"
                    value={config.greeting}
                    onFocus={() => setActiveField('greeting')}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, greeting: e.target.value }))
                    }
                    placeholder="VD: Thân gửi bạn {{Họ và tên}},"
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
                  />
                </div>

                {/* Intro Text */}
                <div>
                  <label
                    htmlFor="email-intro"
                    className="mb-1.5 block text-xs font-semibold text-slate-700"
                  >
                    Nội dung dẫn nhập
                  </label>
                  <textarea
                    id="email-intro"
                    rows={2}
                    value={config.introText}
                    onFocus={() => setActiveField('introText')}
                    onChange={(e) =>
                      setConfig((prev) => ({ ...prev, introText: e.target.value }))
                    }
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
                  />
                </div>

                {/* Data Table Heading & Layout */}
                <div className="grid grid-cols-1 gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="table-heading"
                      className="mb-1.5 block text-xs font-semibold text-slate-700"
                    >
                      Tiêu đề bảng thông tin
                    </label>
                    <input
                      id="table-heading"
                      type="text"
                      value={config.tableHeading}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          tableHeading: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                      Kiểu hiển thị bảng điểm / dữ liệu
                    </span>
                    <div className="flex rounded-lg bg-slate-100 p-1">
                      <button
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({
                            ...prev,
                            tableLayout: 'vertical',
                          }))
                        }
                        className={`flex-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                          config.tableLayout === 'vertical'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Dọc (2 cột)
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({
                            ...prev,
                            tableLayout: 'horizontal',
                          }))
                        }
                        className={`flex-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                          config.tableLayout === 'horizontal'
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Ngang (Hàng)
                      </button>
                    </div>
                  </div>
                </div>

                {/* Feedback Deadline */}
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <div>
                    <label
                      htmlFor="feedback-deadline"
                      className="mb-1.5 block text-xs font-semibold text-slate-700"
                    >
                      Thời hạn phản hồi thắc mắc
                    </label>
                    <input
                      id="feedback-deadline"
                      type="text"
                      value={config.feedbackDeadline}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          feedbackDeadline: e.target.value,
                        }))
                      }
                      placeholder="VD: 17:00 ngày 30/11/2026"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-700 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="feedback-note"
                      className="mb-1.5 block text-xs font-semibold text-slate-700"
                    >
                      Hướng dẫn phản hồi thắc mắc
                    </label>
                    <textarea
                      id="feedback-note"
                      rows={2}
                      value={config.feedbackNote}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          feedbackNote: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Logo & Signature */}
                <div className="space-y-3 border-t border-slate-100 pt-4">
                  <div>
                    <span className="mb-1.5 block text-xs font-semibold text-slate-700">
                      Logo đính kèm đầu email
                    </span>
                    <div className="flex rounded-lg bg-slate-100 p-1">
                      {(
                        [
                          { key: 'none', label: 'Không dùng' },
                          { key: 'upload', label: 'Tải ảnh lên' },
                          { key: 'url', label: 'Đường dẫn URL' },
                        ] as const
                      ).map((mode) => (
                        <button
                          key={mode.key}
                          type="button"
                          onClick={() =>
                            setConfig((prev) => ({ ...prev, logoMode: mode.key }))
                          }
                          className={`flex-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors whitespace-nowrap ${
                            config.logoMode === mode.key
                              ? 'bg-white text-slate-900 shadow-sm'
                              : 'text-slate-600 hover:text-slate-900'
                          }`}
                        >
                          {mode.label}
                        </button>
                      ))}
                    </div>

                    {config.logoMode === 'upload' && (
                      <div className="mt-2.5 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                        <input
                          ref={logoInputRef}
                          type="file"
                          accept="image/png,image/jpeg,image/webp,image/svg+xml"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleLogoUpload(f);
                            e.target.value = '';
                          }}
                        />
                        {config.logoDataUrl ? (
                          <>
                            <img
                              src={config.logoDataUrl}
                              alt={config.logoAlt}
                              className="h-10 max-w-[160px] object-contain"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => logoInputRef.current?.click()}
                                className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                              >
                                Đổi ảnh
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setConfig((prev) => ({
                                    ...prev,
                                    logoDataUrl: '',
                                  }))
                                }
                                className="rounded-md p-1.5 text-slate-400 hover:bg-slate-200 hover:text-red-700"
                                aria-label="Xóa logo"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => logoInputRef.current?.click()}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:border-blue-700 hover:text-blue-700"
                          >
                            <ImageIcon className="h-4 w-4" />
                            <span>Chọn file logo (.png, .jpg, .svg)</span>
                          </button>
                        )}
                      </div>
                    )}

                    {config.logoMode === 'url' && (
                      <input
                        type="url"
                        value={config.logoUrl}
                        onChange={(e) =>
                          setConfig((prev) => ({ ...prev, logoUrl: e.target.value }))
                        }
                        placeholder="https://example.edu.vn/logo.png"
                        className="mt-2.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none"
                      />
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label
                        htmlFor="sig-name"
                        className="mb-1 block text-xs font-semibold text-slate-700"
                      >
                        Tên người gửi / Đơn vị (Chữ ký)
                      </label>
                      <input
                        id="sig-name"
                        type="text"
                        value={config.signatureName}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            signatureName: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="sig-role"
                        className="mb-1 block text-xs font-semibold text-slate-700"
                      >
                        Chức danh / Bộ môn
                      </label>
                      <input
                        id="sig-role"
                        type="text"
                        value={config.signatureRole}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            signatureRole: e.target.value,
                          }))
                        }
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="sig-contact"
                      className="mb-1 block text-xs font-semibold text-slate-700"
                    >
                      Thông tin liên hệ chữ ký
                    </label>
                    <textarea
                      id="sig-contact"
                      rows={2}
                      value={config.signatureContact}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          signatureContact: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-blue-700 focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Right Column: Dispatch Control, Progress Bar, Preview & Recipient Grid */}
          <div className="space-y-6 lg:col-span-7">
            {/* Dispatch & Progress Bar Card */}
            <section className="rounded-xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h2 className="font-display text-base font-semibold text-slate-900">
                    Tiến trình gửi Email hàng loạt
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {workbook
                      ? `Đã chọn ${stats.selected}/${stats.valid} email hợp lệ · Đã gửi ${stats.sent} · Lỗi ${stats.failed}`
                      : 'Nạp file Excel sheet guiemail để chuẩn bị danh sách gửi.'}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {!isSending ? (
                    <>
                      {failedRows.length > 0 && (
                        <button
                          type="button"
                          onClick={handleRetryFailed}
                          disabled={needsAuth}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                          <span>Gửi lại {failedRows.length} email lỗi</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleOpenSendConfirmation}
                        disabled={!canStartSending}
                        className="inline-flex items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 whitespace-nowrap shrink-0"
                      >
                        <Send className="h-4 w-4" />
                        <span>
                          Gửi Email
                          {pendingSelectedRecipients.length > 0
                            ? ` (${pendingSelectedRecipients.length})`
                            : ''}
                        </span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={handleTogglePause}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
                      >
                        {isPaused ? (
                          <>
                            <Play className="h-3.5 w-3.5 text-blue-700" />
                            <span>Tiếp tục</span>
                          </>
                        ) : (
                          <>
                            <Pause className="h-3.5 w-3.5" />
                            <span>Tạm dừng</span>
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={handleStopSending}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 whitespace-nowrap shrink-0"
                      >
                        <Square className="h-3.5 w-3.5" />
                        <span>Dừng</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Progress Bar */}
              {(isSending || sendBatchTotal > 0) && (
                <div className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 text-slate-700">
                      <Mail className="h-3.5 w-3.5 text-blue-700 shrink-0" />
                      <span className="font-medium truncate max-w-[360px]">
                        {isSending
                          ? isPaused
                            ? 'Đã tạm dừng tiến trình gửi'
                            : `Đang gửi: ${currentSendingTarget}`
                          : 'Tiến trình gửi gần nhất'}
                      </span>
                    </div>
                    <div className="font-mono font-semibold tabular-nums text-slate-900">
                      {sendBatchCompleted}/{sendBatchTotal} ({progressPercent}%)
                    </div>
                  </div>

                  <div
                    className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
                    role="progressbar"
                    aria-valuenow={progressPercent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  >
                    <div
                      className={`h-full transition-all duration-300 ${
                        sendBatchFailed > 0 && !isSending
                          ? 'bg-amber-600'
                          : 'bg-blue-700'
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 tabular-nums">
                    <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Thành công: {sendBatchSuccess}
                    </span>
                    <span className="inline-flex items-center gap-1 text-red-700 font-medium">
                      <XCircle className="h-3.5 w-3.5" />
                      Thất bại: {sendBatchFailed}
                    </span>
                  </div>
                </div>
              )}

              {/* Contextual Feedback Banner */}
              {sendBannerMessage && (
                <div
                  className={`mt-4 flex items-start gap-2.5 rounded-lg border px-3.5 py-2.5 text-xs ${
                    sendBannerMessage.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : sendBannerMessage.type === 'error'
                      ? 'border-red-200 bg-red-50 text-red-900'
                      : 'border-amber-200 bg-amber-50 text-amber-900'
                  }`}
                >
                  {sendBannerMessage.type === 'success' ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                  ) : sendBannerMessage.type === 'error' ? (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
                  ) : (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  )}
                  <span>{sendBannerMessage.text}</span>
                </div>
              )}
            </section>

            {/* Right Panel View Switcher */}
            <div className="flex items-center justify-between gap-4">
              <div className="inline-flex rounded-lg bg-slate-200/70 p-1">
                <button
                  type="button"
                  onClick={() => setRightTab('preview')}
                  className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    rightTab === 'preview'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Xem trước Email
                </button>
                <button
                  type="button"
                  onClick={() => setRightTab('recipients')}
                  className={`rounded-md px-3.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap tabular-nums ${
                    rightTab === 'recipients'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Danh sách người nhận {workbook ? `(${workbook.rows.length})` : ''}
                </button>
              </div>
            </div>

            {rightTab === 'preview' ? (
              <EmailPreviewPanel
                workbook={workbook}
                config={config}
                senderEmail={user?.email || null}
                previewIndex={previewIndex}
                onChangePreviewIndex={setPreviewIndex}
              />
            ) : (
              <RecipientTable
                workbook={workbook}
                isSending={isSending}
                onToggleRow={handleToggleRow}
                onToggleAllValid={handleToggleAllValid}
                onPreviewRow={(idx) => {
                  setPreviewIndex(idx);
                  setRightTab('preview');
                }}
              />
            )}
          </div>
        </div>
      </main>

      {/* Mandatory Confirmation Dialog before sending emails via Gmail API */}
      <ConfirmSendModal
        isOpen={isConfirmOpen}
        onCancel={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirmSend}
        senderEmail={user?.email || ''}
        subjectTemplate={config.subject}
        recipients={pendingSelectedRecipients}
      />
    </div>
  );
}
