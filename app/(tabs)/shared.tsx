import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { surface, green, category } from '../../theme/colors';
import { TopNavBar } from '../../components/TopNavBar';
import { Card, HeroCard, ListRow, SectionLabel } from '../../components/ui';

/**
 * SHARED tab — Phase-1 styled STUB.
 *
 * The redesign adds a Household / Shared tab (mockup screen_2h). This placeholder
 * exists so the new bottom-bar route resolves and the design system can be seen
 * in situ; a Phase-2 agent replaces it with the real household UI (invite code,
 * members list, roles) — much of which already lives in
 * `components/HouseholdSection.tsx`.
 */
export default function SharedScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <TopNavBar />
      <ScrollView contentContainerStyle={styles.content}>
        <HeroCard
          eyebrow="Everyone caring for your pets"
          title="Household"
          stats={[
            { value: '—', label: 'Members' },
            { value: '—', label: 'Pets shared' },
            { value: '—', label: 'Logs today' },
          ]}
        />

        <View style={{ height: 18 }} />
        <SectionLabel>Coming soon</SectionLabel>
        <Card>
          <ListRow
            icon="key"
            iconBg={category.breakfastBg}
            iconColor={category.breakfastInk}
            title="Invite code"
            subtitle="Share access with another caregiver"
            divider
          />
          <ListRow
            icon="users"
            iconBg={green.tint}
            iconColor={green.primary}
            title="Members & roles"
            subtitle="Owner, caregiver and sitter access"
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: surface.app },
  content: { paddingHorizontal: 20, paddingBottom: 24 },
});
