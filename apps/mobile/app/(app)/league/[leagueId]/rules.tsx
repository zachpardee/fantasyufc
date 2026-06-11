import { View, Text, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { apiClient } from '../../../../src/api/client';
import type { ScoringSettings } from '@fantasy-ufc/shared';

function fmtDate(iso: string | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function pts(n: number | undefined) {
  if (n == null) return '—';
  return n > 0 ? `+${n} pts` : n < 0 ? `${n} pts` : '—';
}

function Row({ label, value }: { label: string; value: string }) {
  const isNeutral = value === '—';
  const isNeg = value.startsWith('-');
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, isNeutral && s.rowNeutral, isNeg && s.rowNeg]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export default function RulesScreen() {
  const { leagueId } = useLocalSearchParams<{ leagueId: string }>();

  const { data: league, isLoading } = useQuery<any>({
    queryKey: ['league', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}`),
  });

  const { data: ss } = useQuery<ScoringSettings>({
    queryKey: ['scoring-settings', leagueId],
    queryFn: () => apiClient.get(`/leagues/${leagueId}/scoring-settings`),
    enabled: !!leagueId,
  });

  const { data: semisEvent } = useQuery<any>({
    queryKey: ['event', league?.playoffSemisEventId],
    queryFn: () => apiClient.get(`/events/${league!.playoffSemisEventId}`),
    enabled: !!league?.playoffSemisEventId,
  });

  const { data: finalsEvent } = useQuery<any>({
    queryKey: ['event', league?.playoffFinalsEventId],
    queryFn: () => apiClient.get(`/events/${league!.playoffFinalsEventId}`),
    enabled: !!league?.playoffFinalsEventId,
  });

  if (isLoading) {
    return <View style={s.center}><ActivityIndicator color="#c8102e" /></View>;
  }

  const isStaking = league?.leagueFormat === 'staking';
  const weeklyBudget = league?.weeklyBudget ?? 100;
  const seasonActive = ['active', 'playoffs', 'completed'].includes(league?.status ?? '');

  return (
    <ScrollView style={s.container}>
      {league && (
        <Section title="Season">
          <Row label="Format" value={isStaking ? 'Staking' : "Pick 'em"} />
          <Row label="Season length" value={league.seasonLengthMonths ? `${league.seasonLengthMonths} months` : '—'} />
          <Row label="Status" value={league.status ? league.status.charAt(0).toUpperCase() + league.status.slice(1) : '—'} />
          {seasonActive && <Row label="Regular season ends" value={fmtDate(league.seasonEndsAt)} />}
          {semisEvent && <Row label="Semifinals" value={`${semisEvent.name} · ${fmtDate(semisEvent.scheduledAt)}`} />}
          {finalsEvent && <Row label="Finals" value={`${finalsEvent.name} · ${fmtDate(finalsEvent.scheduledAt)}`} />}
          <Row label="Max teams" value={String(league.maxTeams)} />
        </Section>
      )}

      {isStaking ? (
        <>
          <Section title="How It Works">
            <Row label="Weekly budget" value={`$${weeklyBudget} per event`} />
            <Row label="Unused budget" value="Added to your event payout total" />
            <Row label="Bet deadline" value="10 min before prelims begin" />
            <Row label="Fights available" value="Top 6 fights (main card + top prelims)" />
          </Section>

          <Section title="Singles">
            <Row label="What it is" value="One bet on one fighter to win" />
            <Row label="Payout (favorite)" value="Stake × decimal odds" />
            <Row label="Payout (underdog)" value="Stake × decimal odds (higher multiplier)" />
            <Row label="Wrong pick" value="Stake lost" />
          </Section>

          <Section title="Parlays">
            <Row label="What it is" value="Multiple fights combined into one bet" />
            <Row label="Min / max legs" value="2 – 6 fights" />
            <Row label="Odds" value="Each leg's decimal odds multiplied together" />
            <Row label="To win" value="Every leg must be correct" />
            <Row label="One leg wrong" value="Entire parlay lost" />
          </Section>

          <Section title="Event Payout (Your Score)">
            <Row label="Formula" value="Unbet budget + winnings from settled bets" />
            <Row label="Example" value="$100 budget, $30 staked, $30 bet wins at 2× → $70 + $60 = $130" />
          </Section>

          <Section title="Matchups">
            <Row label="Format" value="Head-to-head per event" />
            <Row label="Winner" value="Higher event payout wins the week" />
            <Row label="Standings / seeding" value="Win-loss record, then season bankroll" />
          </Section>

          <Section title="Season Bankroll">
            <Row label="What it tracks" value="Running total of profit / loss across all events" />
            <Row label="Bet win" value="+ (payout − stake)" />
            <Row label="Bet loss" value="− stake" />
            <Row label="Tiebreaker only" value="Breaks ties in win-loss record for seeding" />
          </Section>
        </>
      ) : (
        <>
          <Section title="How It Works">
            <Row label="Format" value="Pick 'em — no rosters or drafts" />
            <Row label="Picks per event" value="Top 6 fights (main card + top prelims)" />
            <Row label="Pick deadline" value="10 min before prelims begin" />
            <Row label="Scoring" value="Points for correct winner + method" />
            <Row label="Prelims scoring" value={ss ? (ss.scorePrelims ? 'Enabled' : 'Disabled') : '—'} />
            <Row label="Early prelims" value={ss ? (ss.scoreEarlyPrelims ? 'Enabled' : 'Disabled') : '—'} />
          </Section>

          <Section title="Pick Scoring">
            <Row label="Correct winner (any method)" value={ss ? pts(ss.ptsWin) : '—'} />
            <Row label="+ KO/TKO method bonus" value={ss ? pts(ss.ptsKoTko) : '—'} />
            <Row label="+ Submission method bonus" value={ss ? pts(ss.ptsSubmission) : '—'} />
            <Row label="+ Decision method bonus" value={ss ? pts(ss.ptsDecision) : '—'} />
            <Row label="Underdog bonus (winner ≥ +350 odds)" value="+10 pts" />
            <Row label="Wrong pick" value="—" />
          </Section>

          <Section title="Event Champion">
            <Row label="What it is" value="Pick one fighter as your event champion" />
            <Row label="Correct pick" value="+30 pts added to your matchup total" />
            <Row label="Wrong pick" value="—" />
            <Row label="Deadline" value="10 min before prelims begin" />
          </Section>

          <Section title="Sweep Bonus">
            <Row label="4 correct picks" value="+5 pts" />
            <Row label="5 correct picks" value="+10 pts" />
            <Row label="6 correct picks (sweep)" value="+20 pts" />
          </Section>

          <Section title="Matchups">
            <Row label="Format" value="Head-to-head per event" />
            <Row label="Matchup win bonus" value="+25 pts" />
            <Row label="Tie bonus" value="+10 pts" />
            <Row label="Loss" value="Event pick points only" />
            <Row label="Standings" value="Total season points" />
          </Section>
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a0a' },

  section: { marginHorizontal: 16, marginBottom: 8 },
  sectionTitle: {
    color: '#555', fontSize: 10, fontWeight: '700', letterSpacing: 1,
    paddingTop: 20, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
    marginBottom: 2,
  },

  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#111',
    gap: 16,
  },
  rowLabel: { color: '#888', fontSize: 14, flex: 1 },
  rowValue: { color: '#fff', fontSize: 14, fontWeight: '600', textAlign: 'right', maxWidth: '55%' },
  rowNeutral: { color: '#444' },
  rowNeg: { color: '#c8102e' },
});
