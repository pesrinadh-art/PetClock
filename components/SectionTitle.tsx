import { StyleSheet, Text } from 'react-native';
import { colors } from '../theme/colors';
import { fonts } from '../theme/fonts';

export function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.title}>{children}</Text>;
}

const styles = StyleSheet.create({
  title: {
    fontSize: 12,
    fontFamily: fonts.extraBold,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: colors.stoneMid,
    marginBottom: 10,
    paddingLeft: 2,
  },
});
