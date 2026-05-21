import crypto from 'crypto';
import { logger } from '@/lib/logger';

const log = logger.child('email');

// Email service for approval workflows
// Supports Resend (recommended) or falls back to console logging in dev

interface EmailConfig {
  apiKey?: string;
  fromEmail: string;
  fromName: string;
}

const config: EmailConfig = {
  apiKey: process.env.RESEND_API_KEY,
  fromEmail: process.env.EMAIL_FROM || '',
  fromName: process.env.EMAIL_FROM_NAME || 'AutoPost',
};

interface SendEmailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

/**
 * Send an email using Resend API
 */
export async function sendEmail(options: SendEmailOptions): Promise<boolean> {
  const { to, subject, html, text } = options;

  if (!config.apiKey) {
    // Dev mode - log to structured logger
    log.info('Email would be sent (no RESEND_API_KEY configured)', {
      to,
      subject,
      bodyPreview: `${text || html.slice(0, 200)}...`,
    });
    return true;
  }

  if (!config.fromEmail) {
    throw new Error('EMAIL_FROM env is required to send email');
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${config.fromName} <${config.fromEmail}>`,
        to: [to],
        subject,
        html,
        text,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      log.error('Failed to send email', { error });
      return false;
    }

    return true;
  } catch (error) {
    log.error('Email send error', { error: error instanceof Error ? error.message : String(error) });
    return false;
  }
}

/**
 * Generate a secure approval token
 */
export function generateApprovalToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Get token expiration date (48 hours from now)
 */
export function getTokenExpiration(): Date {
  return new Date(Date.now() + 48 * 60 * 60 * 1000);
}

interface ApprovalEmailData {
  postId: string;
  postContent: string;
  confidence: number;
  riskLevel: string;
  riskReasons?: string[];
  angle: string;
  aiReasoning?: string;
  scheduledFor?: Date;
  includesLink: boolean;
  linkUrl?: string;
  approvalToken: string;
}

/**
 * Send an approval request email for a post
 */
export async function sendApprovalEmail(
  to: string,
  data: ApprovalEmailData
): Promise<boolean> {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  
  const approveUrl = `${baseUrl}/api/posts/${data.postId}/approve?token=${data.approvalToken}&action=approve`;
  const rejectUrl = `${baseUrl}/api/posts/${data.postId}/approve?token=${data.approvalToken}&action=reject`;
  const editUrl = `${baseUrl}/dashboard/edit/${data.postId}`;
  
  const confidencePercent = Math.round(data.confidence * 100);
  const riskColor = data.riskLevel === 'high' ? '#dc2626' : data.riskLevel === 'medium' ? '#f59e0b' : '#22c55e';
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Post Approval Request</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <div style="background: linear-gradient(135deg, #0077b5 0%, #00a0dc 100%); color: white; padding: 24px; border-radius: 12px 12px 0 0;">
    <h1 style="margin: 0; font-size: 24px;">📝 Post Approval Request</h1>
    <p style="margin: 8px 0 0; opacity: 0.9;">A new LinkedIn post needs your review</p>
  </div>
  
  <div style="border: 1px solid #e5e7eb; border-top: none; padding: 24px; border-radius: 0 0 12px 12px;">
    
    <!-- AI Analysis Summary -->
    <div style="display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap;">
      <div style="flex: 1; min-width: 120px; background: #f3f4f6; padding: 12px; border-radius: 8px; text-align: center;">
        <div style="font-size: 28px; font-weight: bold; color: #0077b5;">${confidencePercent}%</div>
        <div style="font-size: 12px; color: #6b7280;">Confidence</div>
      </div>
      <div style="flex: 1; min-width: 120px; background: #f3f4f6; padding: 12px; border-radius: 8px; text-align: center;">
        <div style="font-size: 18px; font-weight: bold; color: ${riskColor}; text-transform: uppercase;">${data.riskLevel}</div>
        <div style="font-size: 12px; color: #6b7280;">Risk Level</div>
      </div>
      <div style="flex: 1; min-width: 120px; background: #f3f4f6; padding: 12px; border-radius: 8px; text-align: center;">
        <div style="font-size: 14px; font-weight: bold; color: #374151;">${data.angle.replace('_', ' ')}</div>
        <div style="font-size: 12px; color: #6b7280;">Angle</div>
      </div>
    </div>
    
    <!-- AI Reasoning -->
    ${data.aiReasoning ? `
    <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 12px 16px; margin-bottom: 24px; border-radius: 0 8px 8px 0;">
      <strong style="color: #1e40af;">🤖 AI Analysis:</strong>
      <p style="margin: 8px 0 0; color: #1e3a8a;">${data.aiReasoning}</p>
    </div>
    ` : ''}
    
    <!-- Risk Reasons -->
    ${data.riskReasons && data.riskReasons.length > 0 ? `
    <div style="background: #fef2f2; border-left: 4px solid #ef4444; padding: 12px 16px; margin-bottom: 24px; border-radius: 0 8px 8px 0;">
      <strong style="color: #991b1b;">⚠️ Risk Factors:</strong>
      <ul style="margin: 8px 0 0; padding-left: 20px; color: #991b1b;">
        ${data.riskReasons.map(r => `<li>${r}</li>`).join('')}
      </ul>
    </div>
    ` : ''}
    
    <!-- Link Warning -->
    ${data.includesLink ? `
    <div style="background: #fefce8; border-left: 4px solid #eab308; padding: 12px 16px; margin-bottom: 24px; border-radius: 0 8px 8px 0;">
      <strong style="color: #854d0e;">🔗 Contains Link:</strong>
      <p style="margin: 8px 0 0; color: #713f12;">${data.linkUrl || 'External link detected'}</p>
      <p style="margin: 4px 0 0; font-size: 12px; color: #92400e;">Remember: Only 1 in 3 posts should include links</p>
    </div>
    ` : ''}
    
    <!-- Post Content -->
    <div style="margin-bottom: 24px;">
      <h3 style="margin: 0 0 12px; color: #374151;">Post Content:</h3>
      <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; white-space: pre-wrap; font-size: 14px;">${data.postContent}</div>
    </div>
    
    <!-- Scheduled Time -->
    ${data.scheduledFor ? `
    <p style="color: #6b7280; margin-bottom: 24px;">
      <strong>⏰ Scheduled for:</strong> ${new Date(data.scheduledFor).toLocaleString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
      })}
    </p>
    ` : ''}
    
    <!-- Action Buttons -->
    <div style="text-align: center; margin-top: 32px;">
      <a href="${approveUrl}" style="display: inline-block; background: #22c55e; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 8px;">
        ✓ Approve
      </a>
      <a href="${editUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 8px;">
        ✏️ Edit
      </a>
      <a href="${rejectUrl}" style="display: inline-block; background: #ef4444; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; margin: 8px;">
        ✗ Reject
      </a>
    </div>
    
    <p style="text-align: center; color: #9ca3af; font-size: 12px; margin-top: 24px;">
      This approval link expires in 48 hours
    </p>
    
  </div>
  
</body>
</html>
  `.trim();

  const text = `
Post Approval Request
=====================

Confidence: ${confidencePercent}%
Risk Level: ${data.riskLevel.toUpperCase()}
Angle: ${data.angle}

${data.aiReasoning ? `AI Analysis: ${data.aiReasoning}\n` : ''}
${data.riskReasons?.length ? `Risk Factors:\n${data.riskReasons.map(r => `- ${r}`).join('\n')}\n` : ''}
${data.includesLink ? `Contains Link: ${data.linkUrl || 'Yes'}\n` : ''}

Post Content:
${data.postContent}

${data.scheduledFor ? `Scheduled for: ${new Date(data.scheduledFor).toLocaleString()}\n` : ''}

Actions:
- Approve: ${approveUrl}
- Edit: ${editUrl}
- Reject: ${rejectUrl}

This link expires in 48 hours.
  `.trim();

  return sendEmail({
    to,
    subject: `[${data.riskLevel.toUpperCase()} Risk] LinkedIn Post Approval - ${data.angle.replace('_', ' ')}`,
    html,
    text,
  });
}

/**
 * Send notification when a post is auto-approved
 */
export async function sendAutoApprovalNotification(
  to: string,
  data: {
    postId: string;
    postContent: string;
    confidence: number;
    scheduledFor?: Date;
  }
): Promise<boolean> {
  const baseUrl = process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const viewUrl = `${baseUrl}/dashboard/edit/${data.postId}`;
  
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Post Auto-Approved</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  
  <div style="background: #22c55e; color: white; padding: 20px; border-radius: 12px 12px 0 0;">
    <h1 style="margin: 0; font-size: 20px;">✓ Post Auto-Approved</h1>
  </div>
  
  <div style="border: 1px solid #e5e7eb; border-top: none; padding: 20px; border-radius: 0 0 12px 12px;">
    <p>A low-risk post was automatically approved (${Math.round(data.confidence * 100)}% confidence).</p>
    
    <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; margin: 16px 0; white-space: pre-wrap; font-size: 14px;">${data.postContent.slice(0, 500)}${data.postContent.length > 500 ? '...' : ''}</div>
    
    ${data.scheduledFor ? `<p><strong>Scheduled for:</strong> ${new Date(data.scheduledFor).toLocaleString()}</p>` : ''}
    
    <p style="text-align: center; margin-top: 20px;">
      <a href="${viewUrl}" style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none;">View Post</a>
    </p>
  </div>
  
</body>
</html>
  `.trim();

  return sendEmail({
    to,
    subject: '✓ LinkedIn Post Auto-Approved',
    html,
  });
}
