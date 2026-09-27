import { StyleSheet, Text } from 'react-native';
import { ink, space } from '../theme/colors';
import { type } from '../theme/fonts';

/**
 * Legacy section title (food.tsx). Now matches the redesign's sentence-case
 * `SectionLabel` heading. Prefer `SectionLabel` from components/ui in new code.
 */
export function SectionTitle({ children }: { children: string }) {
  return (
    <Text style={styles.title} role="heading">
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  title: {
    ...type.heading,
    color: ink.primary,
    marginBottom: space.sm - 2,
  },
});
