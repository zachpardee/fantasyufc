import { useState } from 'react';
import { View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { apiClient } from '../../../src/api/client';
import type { Fighter } from '@fantasy-ufc/shared';

export default function FighterBrowserScreen() {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [weightClass, setWeightClass] = useState('');

  const { data: fighters, isLoading } = useQuery<Fighter[]>({
    queryKey: ['fighters', search, weightClass],
    queryFn: () => {
      const params = new URLSearchParams({ status: 'active' });
      if (search) params.set('search', search);
      if (weightClass) params.set('weightClass', weightClass);
      return apiClient.get(`/fighters?${params}`);
    },
    staleTime: 60_000,
  });

  return (
    <View style={styles.container}>
      <TextInput
        style={styles.search}
        placeholder="Search fighters..."
        placeholderTextColor="#666"
        value={search}
        onChangeText={setSearch}
      />

      <FlatList
        data={fighters ?? []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push(`/(app)/fighters/${item.id}`)}
          >
            <View style={styles.rowLeft}>
              {item.isChampion && <Text style={styles.champ}>C</Text>}
              <View>
                <Text style={styles.name}>{item.firstName} {item.lastName}</Text>
                {item.nickname && <Text style={styles.nickname}>"{item.nickname}"</Text>}
                <Text style={styles.meta}>{(item as any).weight_class_name}</Text>
              </View>
            </View>
            <View style={styles.rowRight}>
              <Text style={styles.ranking}>{item.ranking ? `#${item.ranking}` : 'NR'}</Text>
              <Text style={styles.record}>{item.record.wins}-{item.record.losses}-{item.record.draws}</Text>
              <Text style={styles.avgPts}>{item.averageFantasyPoints?.toFixed(1) ?? '--'}</Text>
            </View>
          </TouchableOpacity>
        )}
        contentContainerStyle={styles.list}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  search: {
    margin: 12, backgroundColor: '#1a1a1a', borderRadius: 8, padding: 14,
    color: '#fff', fontSize: 15, borderWidth: 1, borderColor: '#333',
  },
  list: { paddingHorizontal: 12 },
  row: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: '#1a1a1a', borderRadius: 8, padding: 14, marginBottom: 6,
    borderWidth: 1, borderColor: '#252525',
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, gap: 10 },
  champ: {
    color: '#ffd700', fontWeight: '800', fontSize: 10,
    backgroundColor: '#2a2400', paddingHorizontal: 5, paddingVertical: 2,
    borderRadius: 3, marginRight: 6,
  },
  name: { color: '#fff', fontSize: 15, fontWeight: '600' },
  nickname: { color: '#666', fontSize: 12, marginTop: 1 },
  meta: { color: '#888', fontSize: 11, marginTop: 2 },
  rowRight: { alignItems: 'flex-end' },
  ranking: { color: '#c8102e', fontWeight: '700', fontSize: 13 },
  record: { color: '#888', fontSize: 12 },
  avgPts: { color: '#aaa', fontSize: 13, fontWeight: '600' },
});
