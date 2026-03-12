import { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import Animated, {
	useSharedValue,
	useAnimatedStyle,
	withTiming,
	withDelay,
	withRepeat,
	withSequence,
	withSpring,
	Easing,
	interpolate,
} from 'react-native-reanimated';
import Logo from '../assets/Logo';
import { purple, orange, white, lightOrange } from '../util/colors';
import { CustomTextBold, CustomTextRegular } from '../util/CustomText';

const { width } = Dimensions.get('window');

// ─── Pulsing ring ─────────────────────────────────────────────────────────────
const PulseRing = ({ delay = 0, size, color, opacity: baseOpacity = 0.18 }) => {
	const anim = useSharedValue(0);
	useEffect(() => {
		anim.value = withDelay(
			delay,
			withRepeat(
				withTiming(1, { duration: 2200, easing: Easing.out(Easing.ease) }),
				-1,
				false,
			),
		);
	}, []);
	const style = useAnimatedStyle(() => ({
		transform: [{ scale: interpolate(anim.value, [0, 1], [0.6, 1.4]) }],
		opacity: interpolate(anim.value, [0, 0.4, 1], [baseOpacity, baseOpacity, 0]),
	}));
	return (
		<Animated.View
			style={[
				{
					position: 'absolute',
					width: size,
					height: size,
					borderRadius: size / 2,
					borderWidth: 2,
					borderColor: color,
				},
				style,
			]}
		/>
	);
};

// ─── Floating blob ────────────────────────────────────────────────────────────
const FloatingBlob = ({ top, left, size, color, delay = 0 }) => {
	const y = useSharedValue(0);
	useEffect(() => {
		y.value = withDelay(
			delay,
			withRepeat(
				withSequence(
					withTiming(-18, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
					withTiming(0, { duration: 2400, easing: Easing.inOut(Easing.sin) }),
				),
				-1,
				false,
			),
		);
	}, []);
	const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
	return (
		<Animated.View
			style={[
				{
					position: 'absolute',
					top,
					left,
					width: size,
					height: size,
					borderRadius: size / 2,
					backgroundColor: color,
				},
				style,
			]}
		/>
	);
};

// ─── Dot indicator ────────────────────────────────────────────────────────────
const LoadingDot = ({ delay }) => {
	const scale = useSharedValue(1);
	const opacity = useSharedValue(0.3);
	useEffect(() => {
		scale.value = withDelay(
			delay,
			withRepeat(
				withSequence(
					withTiming(1.5, { duration: 400 }),
					withTiming(1, { duration: 400 }),
				),
				-1,
				false,
			),
		);
		opacity.value = withDelay(
			delay,
			withRepeat(
				withSequence(
					withTiming(1, { duration: 400 }),
					withTiming(0.3, { duration: 400 }),
				),
				-1,
				false,
			),
		);
	}, []);
	const style = useAnimatedStyle(() => ({
		transform: [{ scale: scale.value }],
		opacity: opacity.value,
	}));
	return <Animated.View style={[styles.dot, style]} />;
};

// ─── Main screen ──────────────────────────────────────────────────────────────
const SplashScreen = () => {
	// Logo entrance
	const logoScale = useSharedValue(0.5);
	const logoOpacity = useSharedValue(0);
	const logoY = useSharedValue(30);

	// Tag line entrance
	const textOpacity = useSharedValue(0);
	const textY = useSharedValue(20);

	// Shimmer line
	const shimmerX = useSharedValue(-width);

	// Bottom bar slide
	const barY = useSharedValue(80);
	const barOpacity = useSharedValue(0);

	useEffect(() => {
		// Logo: spring-bounce in
		logoOpacity.value = withDelay(200, withTiming(1, { duration: 600 }));
		logoY.value = withDelay(200, withSpring(0, { damping: 14, stiffness: 90 }));
		logoScale.value = withDelay(200, withSpring(1, { damping: 12, stiffness: 80 }));

		// Tag line fades up after logo
		textOpacity.value = withDelay(700, withTiming(1, { duration: 600 }));
		textY.value = withDelay(700, withSpring(0, { damping: 16, stiffness: 100 }));

		// Shimmer sweep
		shimmerX.value = withDelay(
			900,
			withRepeat(
				withTiming(width * 1.5, { duration: 1800, easing: Easing.inOut(Easing.ease) }),
				-1,
				false,
			),
		);

		// Bottom bar slides up
		barY.value = withDelay(500, withSpring(0, { damping: 18, stiffness: 100 }));
		barOpacity.value = withDelay(500, withTiming(1, { duration: 500 }));
	}, []);

	const logoStyle = useAnimatedStyle(() => ({
		opacity: logoOpacity.value,
		transform: [{ translateY: logoY.value }, { scale: logoScale.value }],
	}));

	const textStyle = useAnimatedStyle(() => ({
		opacity: textOpacity.value,
		transform: [{ translateY: textY.value }],
	}));

	const shimmerStyle = useAnimatedStyle(() => ({
		transform: [{ translateX: shimmerX.value }],
	}));

	const barStyle = useAnimatedStyle(() => ({
		opacity: barOpacity.value,
		transform: [{ translateY: barY.value }],
	}));

	return (
		<View style={styles.container}>
			{/* Background blobs */}
			<FloatingBlob top={-60} left={-60} size={220} color="rgba(255,255,255,0.06)" delay={0} />
			<FloatingBlob top={80} left={width - 100} size={160} color="rgba(243,135,19,0.12)" delay={600} />
			<FloatingBlob top={400} left={-40} size={180} color="rgba(255,255,255,0.05)" delay={300} />
			<FloatingBlob top={500} left={width - 80} size={130} color="rgba(243,135,19,0.09)" delay={900} />

			{/* Pulse rings behind logo */}
			<PulseRing size={280} color={orange} delay={0} baseOpacity={0.2} />
			<PulseRing size={220} color={white} delay={700} baseOpacity={0.12} />
			<PulseRing size={160} color={orange} delay={1400} baseOpacity={0.15} />

			{/* Logo */}
			<Animated.View style={[styles.logoWrap, logoStyle]}>
				{/* Glow halo behind logo */}
				<View style={styles.logoGlow} />
				{/* Shimmer sweep */}
				<Animated.View style={[styles.shimmer, shimmerStyle]} />
				<Logo style={styles.logo} />
				{/* Orange accent line */}
				<View style={styles.accentLine} />
			</Animated.View>

			{/* Tag line */}
			<Animated.View style={[styles.tagWrap, textStyle]}>
				<CustomTextRegular style={styles.tagText}>Smart Parking Control</CustomTextRegular>
			</Animated.View>

			{/* Bottom bar with dots */}
			<Animated.View style={[styles.bottomBar, barStyle]}>
				<View style={styles.dotsRow}>
					<LoadingDot delay={0} />
					<LoadingDot delay={180} />
					<LoadingDot delay={360} />
				</View>
				<CustomTextRegular style={styles.loadingText}>Loading...</CustomTextRegular>
			</Animated.View>
		</View>
	);
};

const styles = StyleSheet.create({
	container: {
		flex: 1,
		backgroundColor: purple,
		justifyContent: 'center',
		alignItems: 'center',
		overflow: 'hidden',
	},
	logoGlow: {
		position: 'absolute',
		alignSelf: 'center',
		top: -30,
		width: width * 0.9,
		height: width * 0.5,
		borderRadius: width * 0.3,
		backgroundColor: 'rgba(243,135,19,0.10)',
		shadowColor: orange,
		shadowOffset: { width: 0, height: 0 },
		shadowOpacity: 0.5,
		shadowRadius: 55,
		elevation: 0,
	},
	logoWrap: {
		alignItems: 'center',
		paddingHorizontal: 10,
	},
	shimmer: {
		position: 'absolute',
		top: 0,
		bottom: 0,
		width: 80,
		backgroundColor: 'rgba(255,255,255,0.12)',
		transform: [{ skewX: '-20deg' }],
	},
	logo: {
		width: width * 0.82,
		height: (width * 0.82 * 386) / 1442,
	},
	accentLine: {
		marginTop: 14,
		width: width * 0.2,
		height: 3,
		borderRadius: 2,
		backgroundColor: orange,
		opacity: 0.85,
	},
	tagWrap: {
		marginTop: 20,
		alignItems: 'center',
	},
	tagText: {
		color: 'rgba(255,255,255,0.7)',
		fontSize: 14,
		letterSpacing: 2.5,
		textTransform: 'uppercase',
	},
	bottomBar: {
		position: 'absolute',
		bottom: 60,
		alignItems: 'center',
		gap: 10,
	},
	dotsRow: {
		flexDirection: 'row',
		gap: 10,
		alignItems: 'center',
	},
	dot: {
		width: 8,
		height: 8,
		borderRadius: 4,
		backgroundColor: orange,
	},
	loadingText: {
		color: 'rgba(255,255,255,0.45)',
		fontSize: 12,
		letterSpacing: 1.5,
		textTransform: 'uppercase',
	},
});

export default SplashScreen;
