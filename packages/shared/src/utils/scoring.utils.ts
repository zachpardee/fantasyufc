import type { FightResult } from '../types/event.types';
import type { ScoringSettings } from '../types/league.types';
import type { ScoreBreakdown } from '../types/scoring.types';

export function calculateFightScore(
  result: FightResult,
  fighterId: string,
  settings: ScoringSettings,
  isTitleFight: boolean,
  matchupId: string,
): ScoreBreakdown {
  const isWinner = result.winnerId === fighterId;
  const isDraw = result.outcome === 'draw';
  const isNC = result.outcome === 'no_contest';
  const stats = isWinner ? result.winnerStats : result.loserStats;

  let ptsWin = 0;
  let ptsFinish = 0;
  let ptsRoundBonus = 0;
  let ptsSigStrikes = 0;
  let ptsTotalStrikes = 0;
  let ptsKnockdowns = 0;
  let ptsTakedowns = 0;
  let ptsSubmissions = 0;
  let ptsBonuses = 0;

  if (isWinner) {
    ptsWin += settings.ptsWin;
    if (result.outcome === 'ko_tko') {
      ptsFinish += settings.ptsKoTko;
    } else if (result.outcome === 'submission') {
      ptsFinish += settings.ptsSubmission;
    } else {
      ptsFinish += settings.ptsDecision;
    }
    if (result.outcome === 'ko_tko' || result.outcome === 'submission') {
      const roundBonuses = [
        settings.ptsFinishRd1,
        settings.ptsFinishRd2,
        settings.ptsFinishRd3,
        settings.ptsFinishRd4,
        settings.ptsFinishRd5,
      ];
      ptsRoundBonus += roundBonuses[result.endingRound - 1] ?? 0;
    }
  } else if (isDraw) {
    ptsWin += settings.ptsDraw;
  } else if (isNC) {
    ptsWin += settings.ptsNoContest;
  } else {
    ptsWin += settings.ptsLoss;
    if (result.outcome === 'ko_tko') {
      ptsWin += settings.ptsKoLossPenalty;
    }
  }

  if (stats) {
    ptsKnockdowns += (stats.knockdowns ?? 0) * settings.ptsKnockdown;
    ptsSigStrikes += (stats.sigStrikesLanded ?? 0) * settings.ptsSigStrikeLanded;
    ptsSigStrikes += (stats.sigStrikesAttempted ?? 0) * settings.ptsSigStrikeAttempted;
    ptsTotalStrikes += (stats.totalStrikesLanded ?? 0) * settings.ptsTotalStrikeLanded;
    ptsTakedowns += (stats.takedownsLanded ?? 0) * settings.ptsTakedownLanded;
    ptsTakedowns += (stats.takedownsAttempted ?? 0) * settings.ptsTakedownAttempted;
    ptsSubmissions += (stats.submissionAttempts ?? 0) * settings.ptsSubmissionAttempt;
  }

  if (isWinner && result.performanceOfNight) {
    ptsBonuses += settings.ptsPerformanceOfNight;
  }
  if (result.fightOfNight) {
    ptsBonuses += settings.ptsFightOfNight;
  }

  const titleMultiplier = isTitleFight ? settings.titleFightMultiplier : 1;
  const rawTotal = ptsWin + ptsFinish + ptsRoundBonus + ptsSigStrikes + ptsTotalStrikes + ptsKnockdowns + ptsTakedowns + ptsSubmissions + ptsBonuses;
  const totalPoints = Math.max(0, rawTotal * titleMultiplier);

  return {
    fighterId,
    matchupId,
    fightId: result.fightId,
    isStarter: true,
    ptsWin,
    ptsFinish,
    ptsRoundBonus,
    ptsSigStrikes,
    ptsTotalStrikes,
    ptsKnockdowns,
    ptsTakedowns,
    ptsSubmissions,
    ptsBonuses,
    titleMultiplier,
    totalPoints,
  };
}
