import { getServerConfig, sendJson, supabaseRest } from '../lib/api-http.js';

const YEAR_IN_MS = 365 * 24 * 60 * 60 * 1000;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendJson(res, 405, { error: 'Method not allowed.' });
  }

  const config = getServerConfig();
  if (!config.databaseReady) {
    return sendJson(res, 200, { configured: false, available: null });
  }

  try {
    const rows = await supabaseRest(
      config,
      'visit_pass_redemptions?select=request_id,redeemed_at,email_status&order=redeemed_at.desc&limit=1',
      { method: 'GET' },
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      return sendJson(res, 200, { configured: true, available: true, lastRedeemedAt: null, nextAvailableAt: null });
    }

    const latest = rows[0];
    const nextAvailableAt = new Date(new Date(latest.redeemed_at).getTime() + YEAR_IN_MS).toISOString();
    const available = Date.now() >= Date.parse(nextAvailableAt);
    const notificationNeedsRetry = latest.email_status !== 'sent';

    return sendJson(res, 200, {
      configured: true,
      available,
      lastRedeemedAt: latest.redeemed_at,
      nextAvailableAt,
      notificationStatus: latest.email_status,
      retryRequestId: notificationNeedsRetry && !available ? latest.request_id : null,
    });
  } catch (error) {
    console.error('[visit-pass] status check failed:', error);
    return sendJson(res, 500, { configured: true, available: null, error: 'Could not check the pass status.' });
  }
}
