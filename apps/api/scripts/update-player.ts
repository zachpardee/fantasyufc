// One-off: update a Supabase auth user's email + password (admin). Run with:
//   tsx --env-file=.env scripts/update-player.ts <userId> <newEmail> <newPassword>
import { createClient } from '@supabase/supabase-js';

const [userId, email, password] = process.argv.slice(2);

(async () => {
  const admin = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data, error } = await admin.auth.admin.updateUserById(userId, {
    email,
    password,
    email_confirm: true, // mark the new email confirmed so login works immediately
  });

  if (error) {
    console.error('FAILED:', error.message);
    process.exit(1);
  }
  console.log('Updated:', JSON.stringify({ id: data.user.id, email: data.user.email }, null, 2));
})();
