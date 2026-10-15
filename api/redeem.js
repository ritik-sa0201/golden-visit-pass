import {
  getServerConfig,
  isUuid,
  readJsonBody,
  sendJson,
  supabaseRest,
  updateRedemptionEmailStatus,
} from '../lib/api-http.js';

const YEAR_IN_MS = 365 * 24 * 60 * 60 * 1000;

function emailMarkup(redeemedAt) {
  const readableDate = new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: 'Asia/Kolkata',
  }).format(new Date(redeemedAt));

  return {
    subject: '💌 Cutuu just redeemed her Golden Visit Pass',
    text: [
      'Ritik,',
      '',
      'It is official: Cutuu has redeemed her Golden Visit Pass.',
      'This is your cue to stop treating the visit as a someday plan and start arranging the soonest realistic date.',
      'She does not need to send a separate message or email. She has done her part by redeeming the pass.',
      '',
      `Redeemed: ${readableDate} (India time)`,
      '',
      'Your promise: make the visit happen as soon as you reasonably can. ❤️',
    ].join('\n'),
    html: `
      <div style="margin:0;background:#160b10;padding:34px 14px;font-family:Arial,Helvetica,sans-serif;color:#f7edda">
        <div style="max-width:560px;margin:0 auto;border:1px solid #92713e;background:#24131b;padding:34px 28px">
          <div style="font-size:11px;letter-spacing:3px;color:#d9b965;text-transform:uppercase">A Little Promise · Golden Visit Pass</div>
          <h1 style="font-family:Georgia,serif;font-weight:400;font-size:36px;line-height:1.08;margin:24px 0 16px;color:#f4d985">Cutuu has called dibs. ♡</h1>
          <p style="font-size:16px;line-height:1.8;color:#e5d3c9">Ritik, it is official: <strong style="color:#fff2cb">Cutuu has redeemed her Golden Visit Pass.</strong></p>
          <p style="font-size:15px;line-height:1.8;color:#d1bdb6">This is your cue to stop treating the visit as a someday plan and start arranging the soonest realistic date. She has done her part by redeeming the pass. No separate message or email from her is needed.</p>
          <div style="margin:26px 0;padding:17px 18px;border:1px solid #6d5232;background:#1a1015">
            <div style="font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#d9b965">Redeemed on</div>
            <div style="margin-top:8px;font-size:15px;color:#fff2cb">${readableDate} · India time</div>
          </div>
          <p style="font-family:Georgia,serif;font-size:19px;line-height:1.6;color:#f1dca7">Your promise: make the visit happen as soon as you reasonably can. ♥</p>
          <div style="border-top:1px solid #4e3338;margin-top:28px;padding-top:18px;font-size:11px;color:#a99188;letter-spacing:1px">ONE HEART, TWO LOCATIONS · MADE FOR CUTUU</div>
        </div>
      </div>
    `,
  };
}

async function sendNotification(config, requestId, redeemedAt) {
  const email = emailMarkup(redeemedAt);
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.resendApiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `golden-visit-pass-${requestId}`,
    },
    body: JSON.stringify({
      from: config.resendFromEmail,
      to: [config.recipientEmail],
      subject: email.subject,
      html: email.html,
      text: email.text,
    }),
  });

  const raw = await response.text();
  let result = {};
  try { result = raw ? JSON.parse(raw) : {}; } catch { result = { message: raw }; }

  if (!response.ok || !result.id) {
    const reason = result.message || result.name || `Email provider returned ${response.status}`;
    throw new Error(String(reason));
  }

  return result.id;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const config = getServerConfig();
  if (!config.databaseReady) {
    return sendJson(res, 503, { error: 'The visit pass is not connected yet. Ask Ritik to finish the setup first.' });
  }
  if (!config.emailReady) {
    return sendJson(res, 503, { error: 'The email sender is not configured yet. The pass has not been redeemed.' });
  }

  const body = await readJsonBody(req);
  if (body._bodyTooLarge || body._invalidJson || !isUuid(body.requestId)) {
    return sendJson(res, 400, { error: 'Invalid redemption request. Please try again.' });
  }

  let claim;
  try {
    claim = await supabaseRest(config, 'rpc/claim_visit_pass', {
      method: 'POST',
      body: JSON.stringify({ p_request_id: body.requestId }),
    });
  } catch (error) {
    console.error('[visit-pass] claim failed:', error);
    return sendJson(res, 500, { error: 'The pass could not be checked safely. Please try again.' });
  }

  if (!claim || typeof claim !== 'object') {
    return sendJson(res, 500, { error: 'The pass returned an unexpected response. Please try again.' });
  }

  if (!claim.allowed) {
    return sendJson(res, 409, {
      code: 'PASS_ALREADY_REDEEMED',
      error: 'This Golden Visit Pass has already been redeemed. It can be used again after the date shown below.',
      nextAvailableAt: claim.next_available_at ?? null,
      notificationStatus: claim.email_status ?? null,
      retryRequestId: claim.retry_request_id ?? null,
    });
  }

  const redeemedAt = claim.redeemed_at || new Date().toISOString();
  const nextAvailableAt = new Date(Date.parse(redeemedAt) + YEAR_IN_MS).toISOString();

  if (claim.status === 'sent') {
    return sendJson(res, 200, {
      success: true,
      alreadySent: true,
      message: 'Ritik has already been notified by email.',
      redeemedAt,
      nextAvailableAt,
    });
  }

  try {
    const emailId = await sendNotification(config, body.requestId, redeemedAt);
    try {
      await updateRedemptionEmailStatus(config, body.requestId, 'sent', { emailId });
    } catch (updateError) {
      // Resend accepted the message, so do not tell the visitor that it failed.
      // The provider idempotency key prevents a duplicate if a retry is needed.
      console.error('[visit-pass] email sent, but status update failed:', updateError);
    }

    return sendJson(res, 200, {
      success: true,
      message: 'Ritik has been notified by email. Your part is done.',
      redeemedAt,
      nextAvailableAt,
    });
  } catch (error) {
    console.error('[visit-pass] email delivery request failed:', error);
    try {
      await updateRedemptionEmailStatus(config, body.requestId, 'failed', { emailError: error.message });
    } catch (updateError) {
      console.error('[visit-pass] could not record email failure:', updateError);
    }

    return sendJson(res, 502, {
      code: 'EMAIL_SEND_FAILED',
      error: 'The visit is reserved, but the email service could not send the notification just now. Tap retry below. You do not need to redeem again.',
    });
  }
}
