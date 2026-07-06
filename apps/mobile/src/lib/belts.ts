// Belt-holder rules, shared across every screen that shows a member avatar so the logic
// lives in exactly one place. Mirrors hasBelt()/hasBmfBelt() in the web app.

/** Black BMF belt: the league's designated BMF belt holder. */
export function hasBmfBelt(member: any, league: any): boolean {
  return !!league?.bmfBeltHolderId && !!member && member.id === league.bmfBeltHolderId;
}

/**
 * Gold UFC/League champion belt: the season champion, or — before a season is decided —
 * the commissioner.
 */
export function hasUfcBelt(member: any, members: any[] | undefined, league: any): boolean {
  if (!member) return false;
  const anyChampion = (members ?? []).some((m) => m.isChampion);
  return (
    member.isChampion ||
    (!anyChampion && !!league?.commissionerId && member.userId === league.commissionerId)
  );
}
