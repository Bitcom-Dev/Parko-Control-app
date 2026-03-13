import { ActivityIndicator, Alert, TouchableOpacity, View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import { useSession } from '../context/userContext';
import { useRef, useState } from 'react';
import { black, gray, lightOrange, orange, purple, white } from '../util/colors';
import { Stack, router } from 'expo-router';
import { CustomTextBold, CustomTextInputFloating, CustomTextMedium, CustomTextRegular } from '../util/CustomText';
import { general, resize } from '../util/style';
import { authInstance } from '../util/instances';
import useMessage from '../util/messages';
import Logo from '../assets/LogoCheck';
import { MaterialIcons } from '@expo/vector-icons';
import { useAuth } from '../context/userContext';
import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const SignIn = () => {
	const { signIn } = useSession();
	const [loading, setLoading] = useState(false);
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const passwordRef = useRef(null);
	const { AuthScreen: strings } = useMessage();
	const auth = useAuth();

	const login = () => {
		if (loading) return;
		setLoading(true);
		authInstance(auth).post('/login', { username, password })
			.then(response => {
				signIn(response.data);
				setLoading(false);
				router.replace('/');
			})
			.catch(error => {
				setLoading(false);
				if (error.response && (error.response.status === 401 || error.response.status === 404))
					Alert.alert(strings.error, strings.invalidCredentials);
				else if (error.response && error.response.status === 403)
					Alert.alert(strings.error, strings.deactivatedUser);
				else if (error.response && error.response.status === 400)
					Alert.alert(strings.error, strings.connectionError);
			});
	};

	return (
		<KeyboardAvoidingView
			style={styles.root}
			behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
		>
			<Stack.Screen options={{
				headerShown: false,
			}} />

			<ScrollView
				contentContainerStyle={styles.scroll}
				keyboardShouldPersistTaps="handled"
				showsVerticalScrollIndicator={false}
			>
				{/* Hero card */}
				<View style={styles.heroCard}>
					<View style={styles.heroDecorPrimary} />
					<View style={styles.heroDecorSecondary} />
					<View style={styles.heroDecorThird} />

					<View style={styles.heroBadge}>
						<MaterialIcons name="security" size={resize(14)} color={white} />
						<CustomTextMedium style={styles.heroBadgeText}>Parko Control</CustomTextMedium>
					</View>

					<Logo
						width={SCREEN_WIDTH * 0.72}
						height={SCREEN_WIDTH * 0.72 * (61 / 340)}
						primaryColor="white"
						style={{ alignSelf: 'center', marginTop: resize(10), marginBottom: resize(6) }}
					/>

					<CustomTextRegular style={styles.heroSubtitle}>{strings.welcome}</CustomTextRegular>
				</View>

				{/* Form card */}
				<View style={styles.formCard}>
					<CustomTextBold style={styles.formTitle}>{strings.login}</CustomTextBold>

					<CustomTextInputFloating
						value={username}
						onChangeText={setUsername}
						style={{ ...general.fontSize10, width: '100%', marginTop: resize(20) }}
						styleTextInput={{ ...general.fontSize10, color: black }}
						selectionColor={purple}
						label={strings.username}
						autoCapitalize="none"
						returnKeyType="next"
						onSubmitEditing={() => passwordRef.current?.focus()}
						rightIcon="person"
						rightIconColor={orange}
						rightIconSize={resize(24)}
					/>

					<CustomTextInputFloating
						ref={passwordRef}
						value={password}
						onChangeText={setPassword}
						style={{ ...general.fontSize10, width: '100%', marginTop: resize(40) }}
						styleTextInput={{ ...general.fontSize10, color: black }}
						selectionColor={purple}
						label={strings.password}
						secureTextEntryToogle={true}
						returnKeyType="done"
						onSubmitEditing={login}
					/>

					<TouchableOpacity
						activeOpacity={0.82}
						onPress={login}
						disabled={loading}
						style={[styles.loginBtn, loading && styles.loginBtnLoading]}
					>
						{loading
							? <ActivityIndicator size="small" color={white} />
							: <>
								<CustomTextMedium style={styles.loginBtnText}>{strings.login}</CustomTextMedium>
								<MaterialIcons name="arrow-forward" size={resize(20)} color={white} />
							</>
						}
					</TouchableOpacity>
				</View>

				<CustomTextRegular style={styles.footer}>© {new Date().getFullYear()} Parko Control</CustomTextRegular>
			</ScrollView>
		</KeyboardAvoidingView>
	);
};

export default SignIn;

const styles = StyleSheet.create({
	root: {
		flex: 1,
		backgroundColor: lightOrange,
	},
	scroll: {
		flexGrow: 1,
		paddingHorizontal: resize(16),
		paddingTop: resize(48),
		paddingBottom: resize(36),
	},
	heroCard: {
		backgroundColor: purple,
		borderRadius: resize(28),
		padding: resize(24),
		paddingBottom: resize(20),
		overflow: 'hidden',
		...general.shaddowLight,
		marginBottom: resize(16),
	},
	heroDecorPrimary: {
		position: 'absolute',
		width: resize(200),
		height: resize(200),
		borderRadius: resize(100),
		backgroundColor: 'rgba(255,255,255,0.07)',
		top: resize(-60),
		right: resize(-50),
	},
	heroDecorSecondary: {
		position: 'absolute',
		width: resize(130),
		height: resize(130),
		borderRadius: resize(65),
		backgroundColor: 'rgba(243,135,19,0.20)',
		bottom: resize(-40),
		left: resize(-30),
	},
	heroDecorThird: {
		position: 'absolute',
		width: resize(80),
		height: resize(80),
		borderRadius: resize(40),
		backgroundColor: 'rgba(255,255,255,0.05)',
		bottom: resize(20),
		right: resize(20),
	},
	heroBadge: {
		flexDirection: 'row',
		alignItems: 'center',
		alignSelf: 'flex-start',
		gap: resize(6),
		backgroundColor: 'rgba(255,255,255,0.15)',
		paddingHorizontal: resize(12),
		paddingVertical: resize(7),
		borderRadius: resize(999),
		marginBottom: resize(16),
	},
	heroBadgeText: {
		...general.fontSize6,
		color: white,
	},
	heroSubtitle: {
		...general.fontSize6,
		color: 'rgba(255,255,255,0.75)',
		textAlign: 'center',
		marginTop: resize(8),
	},
	formCard: {
		backgroundColor: white,
		borderRadius: resize(24),
		padding: resize(20),
		...general.shaddowLighter,
	},
	formTitle: {
		...general.fontSize14,
		color: purple,
		marginBottom: resize(4),
	},
	formSubtitle: {
		...general.fontSize6,
		color: gray,
		marginBottom: resize(8),
	},
	loginBtn: {
		marginTop: resize(24),
		backgroundColor: orange,
		borderRadius: resize(14),
		height: resize(52),
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: resize(10),
		...general.shaddowLighter,
	},
	loginBtnLoading: {
		opacity: 0.75,
	},
	loginBtnText: {
		...general.fontSize12,
		color: white,
		letterSpacing: resize(1),
	},
	footer: {
		...general.fontSize6,
		color: gray,
		textAlign: 'center',
		marginTop: resize(24),
	},
});
