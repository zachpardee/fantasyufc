/**
 * Monte Carlo season simulator — no database, pure calculation.
 *
 * Models the app's actual Pick'em scoring (scoring.service.ts):
 *   - 6 scored fights per event (main card)
 *   - correct winner: +3, method bonus KO/TKO +5, Sub +5, Dec +2
 *   - underdog bonus +10 when winner closed at >= +350
 *   - event champion pick: +30 if your chosen fighter wins
 *   - sweep bonus: 4/5/6 correct = +5/+10/+20
 *   - round-robin H2H per event, standings by total points then wins
 *   - top 4 playoff: 1v4 / 2v3 semis, then finals (one event each)
 *
 * And the Staking format: weekly budget, odds-based payouts (5% vig),
 * H2H weekly profit, standings by wins then bankroll.
 *
 * Fight model calibrated to real UFC base rates:
 *   favorite implied prob ~ mean .65 (range .51-.88)
 *   finishes: ~31% KO/TKO, ~19% Sub, ~50% Decision
 */

type Method = 'ko' | 'sub' | 'dec';

interface Fight {
  pFav: number; // favorite win probability
  favWon: boolean;
  method: Method;
  underdogPlusOdds: number; // american odds of the underdog
}

interface PlayerSkill {
  name: string;
  favDiscipline: number; // prob of picking the favorite (sharps higher)
  methodAcc: number; // prob of naming the right method given right winner
}

const rand = () => Math.random();

function sampleFight(): Fight {
  // Beta(2,3)-ish skewed toward moderate favorites
  const u = (rand() + rand() + rand()) / 3; // ~bell on [0,1]
  const pFav = 0.51 + u * 0.37; // .51 - .88
  const favWon = rand() < pFav;
  const r = rand();
  const method: Method = r < 0.31 ? 'ko' : r < 0.5 ? 'sub' : 'dec';
  const underdogPlusOdds = Math.round((pFav / (1 - pFav)) * 100);
  return { pFav, favWon, method, underdogPlusOdds };
}

const METHOD_PTS: Record<Method, number> = { ko: 5, sub: 5, dec: 2 };
const PTS_WIN = 3;
const UNDERDOG_BONUS = 10;
const CHAMPION_PTS = 30;
const sweepBonus = (n: number) => (n >= 6 ? 20 : n === 5 ? 10 : n === 4 ? 5 : 0);

/** One player's score for one event (6 fights). */
function pickemEventScore(skill: PlayerSkill, fights: Fight[]): number {
  let pts = 0;
  let correct = 0;
  for (const f of fights) {
    const pickedFav = rand() < skill.favDiscipline;
    const pickedWinner = pickedFav === f.favWon;
    if (!pickedWinner) continue;
    correct++;
    pts += PTS_WIN;
    if (!f.favWon && f.underdogPlusOdds >= 350) pts += UNDERDOG_BONUS;
    // players guess method; decision is the most common guess
    const guessedRight = rand() < skill.methodAcc;
    if (guessedRight) pts += METHOD_PTS[f.method];
  }
  pts += sweepBonus(correct);
  // champion pick: everyone takes the card's biggest favorite
  const champFight = fights.reduce((a, b) => (a.pFav > b.pFav ? a : b));
  if (champFight.favWon) pts += CHAMPION_PTS;
  return pts;
}

/** Staking: weekly budget 100, three archetypes of bettor. */
function stakingEventProfit(style: 'safe' | 'balanced' | 'degen', fights: Fight[]): number {
  const budget = 100;
  let profit = 0;
  const vig = 0.95;
  if (style === 'safe') {
    // 2 big bets on the two biggest favorites
    const sorted = [...fights].sort((a, b) => b.pFav - a.pFav).slice(0, 2);
    for (const f of sorted) {
      const stake = budget / 2;
      const dec = (1 / f.pFav) * vig;
      profit += f.favWon ? stake * (dec - 1) : -stake;
    }
  } else if (style === 'balanced') {
    // spread across 4 fights, mix of favs and one dog
    const sorted = [...fights].sort((a, b) => b.pFav - a.pFav);
    const legs = [sorted[0], sorted[1], sorted[2], sorted[5]];
    for (let i = 0; i < legs.length; i++) {
      const f = legs[i];
      const stake = budget / 4;
      const betFav = i < 3;
      const p = betFav ? f.pFav : 1 - f.pFav;
      const dec = (1 / p) * vig;
      const won = betFav === f.favWon;
      profit += won ? stake * (dec - 1) : -stake;
    }
  } else {
    // degen: 3-leg parlay on favorites + a dog single
    const sorted = [...fights].sort((a, b) => b.pFav - a.pFav);
    const parlayLegs = sorted.slice(0, 3);
    const parlayStake = budget * 0.6;
    const allWon = parlayLegs.every((f) => f.favWon);
    const parlayDec = parlayLegs.reduce((acc, f) => acc * (1 / f.pFav) * vig, 1);
    profit += allWon ? parlayStake * (parlayDec - 1) : -parlayStake;
    const dog = sorted[sorted.length - 1];
    const dogStake = budget * 0.4;
    const dogDec = (1 / (1 - dog.pFav)) * vig;
    profit += !dog.favWon ? dogStake * (dogDec - 1) : -dogStake;
  }
  return profit;
}

/** Round-robin pairings for an event index. Standard circle method. */
function pairings(n: number, round: number): Array<[number, number]> {
  const teams = Array.from({ length: n }, (_, i) => i);
  if (n % 2 === 1) teams.push(-1); // bye
  const m = teams.length;
  const fixed = teams[0];
  const rest = teams.slice(1);
  const rot = round % (m - 1);
  const rotated = [...rest.slice(rest.length - rot), ...rest.slice(0, rest.length - rot)];
  const order = [fixed, ...rotated];
  const out: Array<[number, number]> = [];
  for (let i = 0; i < m / 2; i++) {
    const a = order[i],
      b = order[m - 1 - i];
    if (a !== -1 && b !== -1) out.push([a, b]);
  }
  return out;
}

interface SeasonResult {
  pointsByWeek: number[][]; // [week][team] cumulative points (or bankroll)
  winsByWeek: number[][];
  finalRank: number[]; // rank[team] after regular season (0 = first)
  champion: number; // team index that wins playoffs
  regularSeasonWinner: number;
}

function rankTeams(points: number[], wins: number[]): number[] {
  const idx = points.map((_, i) => i);
  idx.sort((a, b) => points[b] - points[a] || wins[b] - wins[a]);
  const rank = new Array(points.length);
  idx.forEach((team, pos) => {
    rank[team] = pos;
  });
  return rank;
}

function simulateSeason(
  skills: PlayerSkill[],
  events: number,
  format: 'pickem' | 'staking',
): SeasonResult {
  const n = skills.length;
  const points = new Array(n).fill(0);
  const wins = new Array(n).fill(0);
  const pointsByWeek: number[][] = [];
  const winsByWeek: number[][] = [];
  const styles: Array<'safe' | 'balanced' | 'degen'> = skills.map((_, i) =>
    i % 3 === 0 ? 'safe' : i % 3 === 1 ? 'balanced' : 'degen',
  );

  const eventScore = (team: number, fights: Fight[]) =>
    format === 'pickem'
      ? pickemEventScore(skills[team], fights)
      : stakingEventProfit(styles[team], fights);

  for (let w = 0; w < events; w++) {
    const fights = Array.from({ length: 6 }, sampleFight);
    const scores = skills.map((_, t) => eventScore(t, fights));
    for (const [a, b] of pairings(n, w)) {
      if (scores[a] > scores[b]) wins[a]++;
      else if (scores[b] > scores[a]) wins[b]++;
    }
    for (let t = 0; t < n; t++) points[t] += scores[t];
    pointsByWeek.push([...points]);
    winsByWeek.push([...wins]);
  }

  // standings: pick'em by points then wins; staking by wins then bankroll
  const rank = format === 'pickem' ? rankTeams(points, wins) : rankTeams(wins, points);
  const seedOf = (pos: number) => rank.indexOf(pos);
  const [s1, s2, s3, s4] = [seedOf(0), seedOf(1), seedOf(2), seedOf(3)];

  // playoffs: two more events
  const playoffWin = (a: number, b: number): number => {
    const fights = Array.from({ length: 6 }, sampleFight);
    const sa = eventScore(a, fights),
      sb = eventScore(b, fights);
    if (sa === sb) return rank[a] < rank[b] ? a : b; // tie → higher seed
    return sa > sb ? a : b;
  };
  const f1 = playoffWin(s1, s4);
  const f2 = playoffWin(s2, s3);
  const champion = playoffWin(f1, f2);

  return { pointsByWeek, winsByWeek, finalRank: rank, champion, regularSeasonWinner: s1 };
}

// ---------- experiment ----------

function makeSkills(n: number): PlayerSkill[] {
  // spread from casual to sharp; favorite-pick accuracy ~58% -> ~67% implied
  const out: PlayerSkill[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0 : i / (n - 1); // 0 = sharpest, 1 = most casual
    out.push({
      name: `P${i + 1}`,
      favDiscipline: 0.92 - t * 0.22, // .92 sharp -> .70 casual
      methodAcc: 0.52 - t * 0.1, // .52 -> .42
    });
  }
  return out;
}

function quantile(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

function run(format: 'pickem' | 'staking', nTeams: number, events: number, sims: number) {
  const skills = makeSkills(nTeams);
  const checkpoints = [
    Math.floor(events * 0.25),
    Math.floor(events * 0.5),
    Math.floor(events * 0.75),
    events - 1,
  ];

  let leaderQ1HoldsRS = 0,
    leaderHalfHoldsRS = 0,
    leaderHalfWinsTitle = 0;
  let sharpestWinsRS = 0,
    sharpestWinsTitle = 0,
    casualMakesPlayoffs = 0;
  const titleByHalfRank = new Array(nTeams).fill(0);
  const gapFirstToSecond: Record<number, number[]> = {};
  const gapFourthToFifth: Record<number, number[]> = {};
  const aliveAt75: number[] = [];
  // per-event score swing (90th pct) used to define "catchable"
  const perEventDiffs: number[] = [];

  for (const c of checkpoints) {
    gapFirstToSecond[c] = [];
    gapFourthToFifth[c] = [];
  }

  for (let s = 0; s < sims; s++) {
    const r = simulateSeason(skills, events, format);
    const metric = (w: number) => (format === 'pickem' ? r.pointsByWeek[w] : r.winsByWeek[w]);
    const tiebreak = (w: number) => (format === 'pickem' ? r.winsByWeek[w] : r.pointsByWeek[w]);

    for (const c of checkpoints) {
      const pts = metric(c);
      const sorted = [...pts].sort((a, b) => b - a);
      gapFirstToSecond[c].push(sorted[0] - sorted[1]);
      if (nTeams > 4) gapFourthToFifth[c].push(sorted[3] - sorted[4]);
    }

    const rankAt = (w: number) => rankTeams(metric(w), tiebreak(w));
    const q1Leader = rankAt(checkpoints[0]).indexOf(0);
    const halfLeader = rankAt(checkpoints[1]).indexOf(0);
    if (r.regularSeasonWinner === q1Leader) leaderQ1HoldsRS++;
    if (r.regularSeasonWinner === halfLeader) leaderHalfHoldsRS++;
    if (r.champion === halfLeader) leaderHalfWinsTitle++;
    if (r.regularSeasonWinner === 0) sharpestWinsRS++;
    if (r.champion === 0) sharpestWinsTitle++;
    if (r.finalRank[nTeams - 1] < 4) casualMakesPlayoffs++;
    titleByHalfRank[rankAt(checkpoints[1])[r.champion]]++;

    // per-event swing sample (between two median players)
    const w = Math.floor(events / 2);
    const prev = w > 0 ? metric(w - 1) : new Array(nTeams).fill(0);
    const cur = metric(w);
    perEventDiffs.push(Math.abs(cur[0] - prev[0] - (cur[1] - prev[1])));

    // aliveness at 75%: teams within catchable distance of 4th place
    const c75 = checkpoints[2];
    const remaining = events - 1 - c75;
    const pts75 = metric(c75);
    const sorted75 = [...pts75].sort((a, b) => b - a);
    const fourth = sorted75[3];
    // realistic max gain per event vs the team you're chasing
    const maxSwing = format === 'pickem' ? 45 : 1.0; // pickem pts vs staking H2H wins/event
    const alive = pts75.filter((p) => p >= fourth || fourth - p <= remaining * maxSwing).length;
    aliveAt75.push(alive);
  }

  const pct = (x: number) => ((100 * x) / sims).toFixed(1) + '%';
  console.log(
    `\n=== ${format.toUpperCase()} · ${nTeams} teams · ${events}-event season · ${sims} simulated seasons ===`,
  );
  const unit = format === 'pickem' ? 'pts' : 'wins';
  for (const c of checkpoints) {
    const label = c === events - 1 ? 'final' : `week ${c + 1}/${events}`;
    const g12 = gapFirstToSecond[c];
    const line = `gap 1st→2nd @ ${label}: median ${quantile(g12, 0.5).toFixed(0)} ${unit}, p90 ${quantile(g12, 0.9).toFixed(0)} ${unit}`;
    const g45 = gapFourthToFifth[c];
    const bubble =
      nTeams > 4
        ? ` | playoff bubble (4th→5th): median ${quantile(g45, 0.5).toFixed(0)} ${unit}`
        : '';
    console.log('  ' + line + bubble);
  }
  console.log(`  P(leader at 25% mark finishes #1 in regular season): ${pct(leaderQ1HoldsRS)}`);
  console.log(`  P(leader at midseason finishes #1 in regular season): ${pct(leaderHalfHoldsRS)}`);
  console.log(
    `  P(midseason leader wins the TITLE (playoffs)):        ${pct(leaderHalfWinsTitle)}`,
  );
  console.log(`  P(sharpest player finishes #1 regular season):        ${pct(sharpestWinsRS)}`);
  console.log(`  P(sharpest player wins title):                        ${pct(sharpestWinsTitle)}`);
  console.log(
    `  P(most casual player makes playoffs):                 ${pct(casualMakesPlayoffs)}`,
  );
  console.log(
    `  teams still alive for a playoff spot at 75% mark:     median ${quantile(aliveAt75, 0.5)} of ${nTeams} (p10 ${quantile(aliveAt75, 0.1)})`,
  );
  console.log(
    `  title equity by midseason rank: [${titleByHalfRank.map((x) => pct(x)).join(', ')}]`,
  );
  console.log(
    `  typical one-event score swing between two teams: median ${quantile(perEventDiffs, 0.5).toFixed(0)} ${unit === 'pts' ? 'pts' : ''}`,
  );
}

// 4-month season: UFC runs ~3.3 events/month -> ~13 events
const SIMS = 3000;
const EVENTS = parseInt(process.env.EVENTS ?? '13', 10);
for (const nTeams of [6, 10]) {
  run('pickem', nTeams, EVENTS, SIMS);
}
run('staking', 6, EVENTS, SIMS);
run('staking', 10, EVENTS, SIMS);
