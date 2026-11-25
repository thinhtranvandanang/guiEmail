export interface GmailSendResult {
  id: string;
  threadId: string;
}

export class GmailAuthExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GmailAuthExpiredError';
  }
}

export class GmailInsufficientScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GmailInsufficientScopeError';
  }
}

export async function sendSingleGmailMessage(
  accessToken: string,
  rawBase64Url: string
): Promise<GmailSendResult> {
  const response = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw: rawBase64Url }),
    }
  );

  if (response.status === 401) {
    throw new GmailAuthExpiredError(
      'Phiên đăng nhập Gmail đã hết hạn. Vui lòng đăng nhập lại để tiếp tục gửi.'
    );
  }

  if (!response.ok) {
    let detail = `Lỗi HTTP ${response.status}`;
    let reason = '';
    try {
      const errData = await response.json();
      if (errData?.error?.message) {
        detail = errData.error.message;
      }
      if (Array.isArray(errData?.error?.details)) {
        reason = errData.error.details
          .map((d: { reason?: string }) => d.reason || '')
          .join(' ');
      }
    } catch {
      // Ignore JSON parse errors
    }

    if (
      response.status === 403 &&
      (detail.toLowerCase().includes('insufficient') ||
        reason.includes('ACCESS_TOKEN_SCOPE_INSUFFICIENT'))
    ) {
      throw new GmailInsufficientScopeError(
        'Tài khoản chưa được cấp đủ quyền gửi email Gmail. Vui lòng đăng nhập lại và tích chọn quyền gửi email trên màn hình Google.'
      );
    }

    throw new Error(detail);
  }

  const data = await response.json();
  return {
    id: data.id || '',
    threadId: data.threadId || '',
  };
}
