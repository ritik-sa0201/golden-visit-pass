export function sendJson(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(payload));
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }

  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 16_384) {
        raw = '';
        resolve({ _bodyTooLarge: true });
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try { resolve(JSON.parse(raw)); } catch { resolve({ _invalidJson: true }); }
    });
    req.on('error', () => resolve({ _invalidJson: true }));
  });
}

export function getServerConfig() {
  const supabaseUrl = process.env.SUPABASE_URL?.replace(/\/$/, '');
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendApiKey = process.env.RESEND_API_KEY;
  const resendFromEmail = process.env.RESEND_FROM_EMAIL;
  const recipientEmail = process.env.REDEMPTION_NOTIFY_EMAIL || 'ritik.sainicoding@gmail.com';

  return {
    supabaseUrl,
    supabaseKey,
    resendApiKey,
    resendFromEmail,
    recipientEmail,
    databaseReady: Boolean(supabaseUrl && supabaseKey),
    emailReady: Boolean(resendApiKey && resendFromEmail),
  };
}

export async function supabaseRest(config, path, options = {}) {
  const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: config.supabaseKey,
      Authorization: `Bearer ${config.supabaseKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  const raw = await response.text();
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }

  if (!response.ok) {
    const message = typeof body?.message === 'string' ? body.message : `Supabase request failed (${response.status})`;
    throw new Error(message);
  }

  return body;
}

export async function updateRedemptionEmailStatus(config, requestId, status, details = {}) {
  const query = `visit_pass_redemptions?request_id=eq.${encodeURIComponent(requestId)}`;
  return supabaseRest(config, query, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({
      email_status: status,
      email_id: details.emailId ?? null,
      email_error: details.emailError ? String(details.emailError).slice(0, 500) : null,
    }),
  });
}

export function isUuid(value) {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
