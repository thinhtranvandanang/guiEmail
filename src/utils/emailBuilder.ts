import { EmailConfig, RecipientRow } from '../types/mail';

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatMultilineHtml(input: string): string {
  return escapeHtml(input).replace(/\r?\n/g, '<br />');
}

export function interpolateTemplate(
  template: string,
  row: RecipientRow
): string {
  if (!template) return '';
  return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (match, rawKey) => {
    const key = String(rawKey).trim();
    if (key in row.fields) {
      return row.fields[key] ?? '';
    }
    const lowerKey = key.toLowerCase();
    if (lowerKey === row.emailHeader.toLowerCase() || lowerKey === 'email') {
      return row.email;
    }
    const matchedCol = Object.keys(row.fields).find(
      (col) => col.trim().toLowerCase() === lowerKey
    );
    if (matchedCol) {
      return row.fields[matchedCol] ?? '';
    }
    return match;
  });
}

function isSafeHttpUrl(url: string): boolean {
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

export function buildEmailHtml(
  row: RecipientRow,
  infoColumns: string[],
  config: EmailConfig,
  useCidLogo: boolean
): string {
  const greetingText = interpolateTemplate(config.greeting, row);
  const introText = interpolateTemplate(config.introText, row);
  const tableHeadingText = interpolateTemplate(config.tableHeading, row);
  const deadlineText = interpolateTemplate(config.feedbackDeadline, row);
  const feedbackNoteText = interpolateTemplate(config.feedbackNote, row);

  let logoSrc = '';
  if (config.logoMode === 'upload' && config.logoDataUrl) {
    logoSrc = useCidLogo ? 'cid:company_logo' : config.logoDataUrl;
  } else if (config.logoMode === 'url' && isSafeHttpUrl(config.logoUrl)) {
    logoSrc = config.logoUrl.trim();
  }

  const logoBlock = logoSrc
    ? `
      <tr>
        <td style="padding: 24px 32px 16px 32px; border-bottom: 1px solid #e2e8f0;">
          <img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(config.logoAlt || 'Logo đơn vị')}" style="max-height: 52px; max-width: 220px; width: auto; height: auto; display: block; border: 0;" />
        </td>
      </tr>`
    : '';

  const dataTableHtml =
    config.tableLayout === 'horizontal'
      ? `
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 6px; overflow: hidden; margin-top: 12px;">
          <thead>
            <tr style="background-color: #f8fafc;">
              ${infoColumns
                .map(
                  (col) =>
                    `<th align="left" style="padding: 10px 14px; font-size: 12px; font-weight: 600; color: #475569; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; text-align: left;">${escapeHtml(col)}</th>`
                )
                .join('')}
            </tr>
          </thead>
          <tbody>
            <tr>
              ${infoColumns
                .map(
                  (col) =>
                    `<td style="padding: 12px 14px; font-size: 14px; font-weight: 600; color: #0f172a; border-right: 1px solid #e2e8f0;">${escapeHtml(row.fields[col] ?? '—')}</td>`
                )
                .join('')}
            </tr>
          </tbody>
        </table>`
      : `
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; border: 1px solid #e2e8f0; margin-top: 12px;">
          <tbody>
            ${infoColumns
              .map(
                (col, index) => `
              <tr style="background-color: ${index % 2 === 0 ? '#ffffff' : '#f8fafc'};">
                <td style="width: 42%; padding: 10px 14px; font-size: 13px; font-weight: 500; color: #475569; border-bottom: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0;">${escapeHtml(col)}</td>
                <td style="padding: 10px 14px; font-size: 14px; font-weight: 600; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${escapeHtml(row.fields[col] ?? '—')}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>`;

  const deadlineBlock =
    deadlineText.trim() || feedbackNoteText.trim()
      ? `
        <div style="margin-top: 22px; padding: 14px 16px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
          ${
            deadlineText.trim()
              ? `<p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 600; color: #0f172a;">Thời hạn phản hồi thắc mắc: <span style="color: #1d4ed8;">${escapeHtml(deadlineText)}</span></p>`
              : ''
          }
          ${
            feedbackNoteText.trim()
              ? `<p style="margin: 0; font-size: 13px; line-height: 1.55; color: #475569;">${formatMultilineHtml(feedbackNoteText)}</p>`
              : ''
          }
        </div>`
      : '';

  const hasSignature =
    config.signatureName.trim() ||
    config.signatureRole.trim() ||
    config.signatureContact.trim();

  const signatureBlock = hasSignature
    ? `
      <tr>
        <td style="padding: 20px 32px 28px 32px; border-top: 1px solid #e2e8f0; background-color: #f8fafc;">
          ${
            config.signatureName.trim()
              ? `<p style="margin: 0 0 4px 0; font-size: 14px; font-weight: 700; color: #0f172a;">${escapeHtml(config.signatureName)}</p>`
              : ''
          }
          ${
            config.signatureRole.trim()
              ? `<p style="margin: 0 0 4px 0; font-size: 13px; color: #475569;">${escapeHtml(config.signatureRole)}</p>`
              : ''
          }
          ${
            config.signatureContact.trim()
              ? `<p style="margin: 0; font-size: 12px; line-height: 1.5; color: #64748b;">${formatMultilineHtml(config.signatureContact)}</p>`
              : ''
          }
        </td>
      </tr>`
    : '';

  return `<!DOCTYPE html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  </head>
  <body style="margin: 0; padding: 24px 12px; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #0f172a;">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width: 620px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
      ${logoBlock}
      <tr>
        <td style="padding: 28px 32px 24px 32px;">
          <p style="margin: 0 0 14px 0; font-size: 15px; font-weight: 600; color: #0f172a; line-height: 1.5;">
            ${formatMultilineHtml(greetingText)}
          </p>
          ${
            introText.trim()
              ? `<p style="margin: 0 0 20px 0; font-size: 14px; color: #334155; line-height: 1.6;">${formatMultilineHtml(introText)}</p>`
              : ''
          }
          ${
            tableHeadingText.trim()
              ? `<p style="margin: 0; font-size: 13px; font-weight: 700; color: #1e293b; letter-spacing: 0.01em;">${escapeHtml(tableHeadingText)}</p>`
              : ''
          }
          ${dataTableHtml}
          ${deadlineBlock}
        </td>
      </tr>
      ${signatureBlock}
    </table>
  </body>
</html>`;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function utf8ToBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return uint8ArrayToBase64(bytes);
}

function wrapBase64(base64: string, lineLength = 76): string {
  const lines: string[] = [];
  for (let i = 0; i < base64.length; i += lineLength) {
    lines.push(base64.slice(i, i + lineLength));
  }
  return lines.join('\r\n');
}

function encodeRfc2047(text: string): string {
  return `=?UTF-8?B?${utf8ToBase64(text)}?=`;
}

function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface MimeBuildParams {
  fromEmail: string;
  fromName?: string;
  toEmail: string;
  subject: string;
  htmlBody: string;
  logoDataUrl?: string;
}

export function buildGmailRawMessage(params: MimeBuildParams): string {
  const { fromEmail, fromName, toEmail, subject, htmlBody, logoDataUrl } = params;

  const cleanFromName = (fromName || '').replace(/[\r\n]/g, ' ').trim();
  const cleanFromEmail = fromEmail.replace(/[\r\n]/g, '').trim();
  const cleanToEmail = toEmail.replace(/[\r\n]/g, '').trim();
  const cleanSubject = subject.replace(/[\r\n]/g, ' ').trim();

  const fromHeader = cleanFromName
    ? `${encodeRfc2047(cleanFromName)} <${cleanFromEmail}>`
    : cleanFromEmail;

  const htmlBase64 = wrapBase64(utf8ToBase64(htmlBody));

  // Check if we have a data URL logo to attach inline via multipart/related
  const dataUrlMatch = logoDataUrl?.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);

  let rawMessage = '';

  if (dataUrlMatch) {
    const mimeType = dataUrlMatch[1];
    const imageBase64 = wrapBase64(dataUrlMatch[2]);
    const ext = mimeType.split('/')[1]?.replace('+xml', '') || 'png';
    const boundary = `----=_MailSheet_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

    rawMessage = [
      `From: ${fromHeader}`,
      `To: ${cleanToEmail}`,
      `Subject: ${encodeRfc2047(cleanSubject)}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/related; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      htmlBase64,
      '',
      `--${boundary}`,
      `Content-Type: ${mimeType}; name="logo.${ext}"`,
      'Content-Transfer-Encoding: base64',
      'Content-ID: <company_logo>',
      `Content-Disposition: inline; filename="logo.${ext}"`,
      '',
      imageBase64,
      '',
      `--${boundary}--`,
    ].join('\r\n');
  } else {
    rawMessage = [
      `From: ${fromHeader}`,
      `To: ${cleanToEmail}`,
      `Subject: ${encodeRfc2047(cleanSubject)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      htmlBase64,
    ].join('\r\n');
  }

  return toBase64Url(utf8ToBase64(rawMessage));
}
