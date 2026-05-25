import { db } from '../config/database';
import { env } from '../config/env';
import type { NotificationType } from '@fantasy-ufc/shared';

export async function sendNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  const { rows: [notif] } = await db.query(
    `INSERT INTO notifications (user_id, type, title, body, data) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
    [userId, type, title, body, data ? JSON.stringify(data) : null],
  );

  const { rows: [profile] } = await db.query(
    `SELECT push_token, notification_prefs FROM user_profiles WHERE id = $1`,
    [userId],
  );

  if (!profile?.push_token || !env.EXPO_ACCESS_TOKEN) return;

  const prefKey = notifTypeToPrefKey(type);
  if (prefKey && !profile.notification_prefs?.[prefKey]) return;

  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}`,
      },
      body: JSON.stringify({
        to: profile.push_token,
        title,
        body,
        data: { notificationId: notif.id, ...data },
      }),
    });

    if (response.ok) {
      await db.query(
        `UPDATE notifications SET push_sent = true, push_sent_at = NOW() WHERE id = $1`,
        [notif.id],
      );
    }
  } catch {
    // Push failure is non-fatal
  }
}

function notifTypeToPrefKey(type: NotificationType): string | null {
  const map: Partial<Record<NotificationType, string>> = {
    draft_pick: 'draftPicks',
    fight_result: 'fightResults',
    event_starting: 'eventStarting',
  };
  return map[type] ?? null;
}
