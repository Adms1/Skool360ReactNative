import React, {useEffect, useRef} from 'react';
import {Animated, Easing, Platform, StyleSheet, Text, TouchableOpacity, View} from 'react-native';
import Svg, {Circle, G, Line, Path} from 'react-native-svg';

interface Props {
  title: string;
  onRetry: () => void;
}

const NAVY = '#173a9c';
const BLUE = '#3b82f6';
const SOFT = '#eef1fb';
const GREY = '#c3c9e0';
const RED = '#d32f2f';

const BrokenTower = () => (
  <Svg width={220} height={220} viewBox="0 0 200 200">
    {/* soft background circle */}
    <Circle cx="100" cy="100" r="92" fill={SOFT} />

    {/* ground */}
    <Line x1="30" y1="182" x2="170" y2="182" stroke={GREY} strokeWidth="3" strokeLinecap="round" />

    {/* lower tower legs */}
    <Line x1="72" y1="182" x2="92" y2="100" stroke={NAVY} strokeWidth="4" strokeLinecap="round" />
    <Line x1="128" y1="182" x2="108" y2="100" stroke={NAVY} strokeWidth="4" strokeLinecap="round" />

    {/* cross braces */}
    <G stroke={BLUE} strokeWidth="2.5" strokeLinecap="round">
      <Line x1="77.4" y1="160" x2="122.6" y2="160" />
      <Line x1="82.7" y1="138" x2="117.3" y2="138" />
      <Line x1="87.6" y1="118" x2="112.4" y2="118" />
      <Line x1="77.4" y1="160" x2="117.3" y2="138" />
      <Line x1="122.6" y1="160" x2="82.7" y2="138" />
      <Line x1="82.7" y1="138" x2="112.4" y2="118" />
      <Line x1="117.3" y1="138" x2="87.6" y2="118" />
    </G>

    {/* jagged break */}
    <Path
      d="M90 104 L96 94 L100 103 L105 93 L110 104"
      stroke={NAVY}
      strokeWidth="3.5"
      fill="none"
      strokeLinejoin="round"
      strokeLinecap="round"
    />

    {/* sparks at the break */}
    <G stroke={RED} strokeWidth="2.5" strokeLinecap="round">
      <Line x1="84" y1="92" x2="78" y2="86" />
      <Line x1="100" y1="86" x2="100" y2="78" />
      <Line x1="116" y1="92" x2="122" y2="86" />
    </G>

    {/* fallen top section */}
    <G transform="translate(34 8) rotate(30 107 100)">
      <Line x1="93" y1="100" x2="100" y2="50" stroke={NAVY} strokeWidth="4" strokeLinecap="round" />
      <Line x1="107" y1="100" x2="100" y2="50" stroke={NAVY} strokeWidth="4" strokeLinecap="round" />
      <Line x1="95.8" y1="80" x2="104.2" y2="80" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" />
      <Line x1="93" y1="100" x2="104.2" y2="80" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" />
      <Line x1="107" y1="100" x2="95.8" y2="80" stroke={BLUE} strokeWidth="2.5" strokeLinecap="round" />
      <Line x1="100" y1="50" x2="100" y2="36" stroke={NAVY} strokeWidth="3" strokeLinecap="round" />
      <Circle cx="100" cy="32" r="4" fill={RED} />
    </G>

    {/* lost signal arcs */}
    <G stroke={NAVY} strokeWidth="3" fill="none" strokeLinecap="round" strokeDasharray="4 6" opacity={0.45}>
      <Path d="M78 46 A26 26 0 0 1 78 14" />
      <Path d="M66 54 A40 40 0 0 1 66 6" />
    </G>
  </Svg>
);

const OfflineView: React.FC<Props> = ({title, onRetry}) => {
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, {toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true}),
        Animated.timing(bob, {toValue: 0, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true}),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);

  return (
    <View style={styles.screen}>
      <Animated.View
        style={{
          transform: [{translateY: bob.interpolate({inputRange: [0, 1], outputRange: [0, -8]})}],
        }}>
        <BrokenTower />
      </Animated.View>

      <Text allowFontScaling={false} style={styles.title}>{title}</Text>
      <Text allowFontScaling={false} style={styles.sub}>
        We couldn't reach the server. Check your connection and give it another go.
      </Text>

      <TouchableOpacity style={styles.button} onPress={onRetry} activeOpacity={0.85}>
        <Text allowFontScaling={false} style={styles.buttonText}>Try again</Text>
      </TouchableOpacity>
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
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 30,
    zIndex: 60,
  },
  orgName: {
    marginTop: 12,
    fontSize: 20,
    color: '#1b5e3b',
    fontFamily: Platform.select({ios: 'Georgia', android: 'serif'}),
  },
  title: {
    marginTop: 14,
    fontSize: 20,
    fontWeight: '700',
    color: NAVY,
  },
  sub: {
    marginTop: 8,
    marginBottom: 28,
    fontSize: 13.5,
    lineHeight: 20,
    color: '#6b7494',
    textAlign: 'center',
    maxWidth: 280,
  },
  button: {
    backgroundColor: BLUE,
    borderRadius: 24,
    paddingVertical: 13,
    paddingHorizontal: 44,
    elevation: 3,
    shadowColor: BLUE,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});

export default OfflineView;