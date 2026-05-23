export type NotificationType =
  | 'trade_offer'
  | 'trade_accepted'
  | 'trade_rejected'
  | 'draft_pick'
  | 'fight_result'
  | 'event_starting'
  | 'matchup_result'
  | 'league_invite';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  pushSent: boolean;
  pushSentAt?: string;
  createdAt: string;
}
