import { SESClient, SendRawEmailCommand } from "@aws-sdk/client-ses";

export type RawEmailAttachment = {
  filename: string;
  contentType: string;
  content: Buffer;
};

function chunkBase64(input: Buffer): string {
  const b64 = input.toString("base64");
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 76) {
    lines.push(b64.slice(i, i + 76));
  }
  return lines.join("\r\n");
}

export async function sendRawEmailWithAttachments(params: {
  to: string;
  from: string;
  subject: string;
  html: string;
  attachments: RawEmailAttachment[];
  ses?: SESClient;
}): Promise<{ messageId?: string }> {
  const boundary = `----photocloud-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const headers = [
    `From: ${params.from}`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
  ];

  const parts: string[] = [];
  parts.push(`--${boundary}`);
  parts.push(`Content-Type: text/html; charset="UTF-8"`);
  parts.push(`Content-Transfer-Encoding: 7bit`);
  parts.push(``);
  parts.push(params.html);
  parts.push(``);

  for (const att of params.attachments) {
    parts.push(`--${boundary}`);
    parts.push(`Content-Type: ${att.contentType}; name="${att.filename}"`);
    parts.push(`Content-Disposition: attachment; filename="${att.filename}"`);
    parts.push(`Content-Transfer-Encoding: base64`);
    parts.push(``);
    parts.push(chunkBase64(att.content));
    parts.push(``);
  }

  parts.push(`--${boundary}--`);
  parts.push(``);

  const raw = Buffer.from([...headers, ...parts].join("\r\n"));
  const ses = params.ses ?? new SESClient({});
  const res = await ses.send(
    new SendRawEmailCommand({
      RawMessage: { Data: raw },
    })
  );
  return { messageId: res.MessageId };
}

