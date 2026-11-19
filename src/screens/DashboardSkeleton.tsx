import React, {useEffect, useRef} from 'react';
import {Animated, StyleSheet, View} from 'react-native';

const BLUE = '#3b82f6';

interface Props {
  topInset?: number; // height of the status bar / notch when the screen is not inside a SafeAreaView
  blockTouches?: boolean; // true: taps do not reach the screen underneath
}

// Grey placeholder that looks like the dashboard (blue header + two columns of tiles). It pulses softly.
const DashboardSkeleton: React.FC<Props> = ({topInset = 0, blockTouches = false}) => {
  const pulse = useRef(new Animated.Value(0.45)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {toValue: 1, duration: 750, useNativeDriver: true}),
        Animated.timing(pulse, {toValue: 0.45, duration: 750, useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <View pointerEvents={blockTouches ? 'auto' : 'none'} style={styles.screen}>
      <View style={[styles.header, {height: 60 + topInset, paddingTop: topInset}]}>
        <Animated.View style={[styles.headerRow, {opacity: pulse}]}>
          <View style={styles.headerIcon} />
          <View style={styles.yearPill} />
          <View style={styles.spacer} />
          <View style={styles.headerIcon} />
          <View style={styles.headerIcon} />
          <View style={styles.headerIcon} />
        </Animated.View>
      </View>
      <Animated.View style={[styles.grid, {opacity: pulse}]}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map(i => (
          <View key={i} style={styles.tile}>
            <View style={styles.tileIcon} />
            <View style={styles.tileLine} />
          </View>
        ))}
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#f2f5fb',
    zIndex: 50,
  },
  header: {
    justifyContent: 'center',
    paddingHorizontal: 16,
    backgroundColor: BLUE,
  },
  headerRow: {flexDirection: 'row', alignItems: 'center'},
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 12,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  yearPill: {width: 92, height: 30, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.45)'},
  spacer: {flex: 1},
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  tile: {
    width: '48%',
    height: 118,
    borderRadius: 14,
    marginBottom: 14,
    padding: 16,
    justifyContent: 'flex-end',
    backgroundColor: '#dde3f0',
  },
  tileIcon: {width: 36, height: 36, borderRadius: 18, marginBottom: 12, backgroundColor: '#cbd3e6'},
  tileLine: {width: '70%', height: 12, borderRadius: 6, backgroundColor: '#cbd3e6'},
});

export default DashboardSkeleton;