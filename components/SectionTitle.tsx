import { StyleSheet, Text } from 'react-native';
import { ink } from '../theme/colors';
import { fonts } from '../theme/fonts';

/** Legacy section heading — design v2 `.sec-t`: sentence-case, weight 500. Prefer `ui/SectionLabel`. */
export function SectionTitle({ children }: { children: string }) {
  return (
    <Text style={styles.title} role="heading">
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 15,
    fontFamily: fonts.medium,
    letterSpacing: -0.25,
    color: ink.primary,
    marginBottom: 10,
    paddingLeft: 2,
  },
});
