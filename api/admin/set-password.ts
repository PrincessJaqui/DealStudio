/**
 * Master Admin: set a user's password.
 *
 * Uses the service-role key, which bypasses every RLS policy, so the FIRST
 * thing it does is verify the *caller* is a platform admin. Without that check
 * this endpoint would let anyone take over any account.
 */
import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.VITE_SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { persistSession: false } },
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' });

  try {
    const token = (req.headers.authorization || '').replace('Bearer ', '');
    const { data: caller } = await admin.auth.getUser(token);
    if (!caller?.user) return res.status(401).json({ error: 'not authenticated' });

    // Authorisation: the caller must be a platform admin.
    const { data: isAdmin } = await admin
      .from('platform_admins').select('auth_user_id')
      .eq('auth_user_id', caller.user.id).maybeSingle();
    if (!isAdmin) return res.status(403).json({ error: 'not authorized' });

    const { user_id, password } = req.body ?? {};
    if (!user_id || typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'user_id and a password of 8+ characters are required' });
    }

    const { error } = await admin.auth.admin.updateUserById(user_id, { password });
    if (error) return res.status(400).json({ error: error.message });

    return res.status(200).json({ ok: true });
  } catch (e: any) {
    console.error('[set-password]', e);
    return res.status(500).json({ error: e?.message || 'failed' });
  }
}
