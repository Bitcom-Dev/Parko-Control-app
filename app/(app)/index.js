import { Link, Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Alert, StyleSheet, TouchableOpacity, View } from "react-native";
import { Ionicons, MaterialIcons, MaterialCommunityIcons, FontAwesome6, Fontisto } from '@expo/vector-icons';
import { resize, general } from "../../util/style";
import { black, gray, green, lightGray, lightOrange, orange, purple, white } from "../../util/colors";
import { CustomTextBold, CustomTextInputFloating, CustomTextMedium, CustomTextRegular } from "../../util/CustomText";
import { useCallback, useState } from "react";
import { useMessage } from "../../util/messages";
import { controlInstance } from "../../util/instances";
import { useAuth, useSession } from "../../context/userContext";
import { FlashList } from "@shopify/flash-list";
import ModuleMenu from "../../util/ModuleMenu";

export default function Index() {
    const { HomeScreen: strings } = useMessage();
    const [loading, setLoading] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);
	const { vehicleSelected="", details=null, tsSelected } = useLocalSearchParams();
    const [vehicle, setVehicle] = useState(vehicleSelected);
    const [ts, setTs] = useState(tsSelected);
    const [session, setSession] = useState(JSON.parse(details));
	const [history, setHistory] = useState([]);
	const auth = useAuth();
	const userSession = useSession();
	const [menuVisible, setMenuVisible] = useState(false);

	const handleInspectionNote = useCallback(() => {
		const licensePlate = (session?.vehicle || vehicle || '').toString().trim();
		if (!licensePlate) return;
		router.push({
			pathname: '/nota-constatare',
			params: {
				license_plate: licensePlate,
				source: 'home',
				preset_violation_type: 'unpaid_parking',
				preset_violation_code: 'unpaid_parking',
				lock_violation_type: '1',
			},
		});
	}, [session?.vehicle, vehicle]);

	const loadData = () => {
		if (loadingHistory) return;
		setLoadingHistory(true);
		controlInstance(auth).get('/history', { params: { offset: 0, limit: 5 } })
			.then(response => { setHistory(response.data); })
			.catch(error => {  })
			.finally(() => { setLoadingHistory(false); });
	};

    useFocusEffect(useCallback(() => { loadData(); }, []));

	function formatDate(dateString) {
		const date = new Date(dateString);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${day}-${month}-${year}`;
	}

	function formatTime(dateString) {
		const date = new Date(dateString);
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');
		return `${hours}:${minutes}`;
	}

	const timeAgo = (dateString) => {
		const date = new Date(dateString);
		const now = new Date();
		const s = (now.getTime() - date.getTime()) / 1000;
		if (s < 60) return strings.now;
		if (s < 3600) return `${parseInt(s / 60)} ${strings.minutes}`;
		if (s <= 86400) return `${parseInt(s / 3600)} ${strings.hours}`;
		const day = parseInt(s / 86400);
		if (day <= 7) return `${day} ${strings.days}`;
		if (day <= 30) return `${parseInt(day / 7)} ${strings.weeks}`;
		if (day <= 365) return `${parseInt(day / 30)} ${strings.months}`;
		return `${parseInt(day / 365)} ${strings.years}`;
	};

	const overtime = (dateString) => {
		const date = new Date(dateString);
		const now = new Date();
		const s = (now.getTime() - date.getTime()) / 1000;
		if (s < 60) return `0 ${strings.minutes}`;
		if (s < 3600) return `${parseInt(s / 60)} ${strings.minutes}`;
		if (s <= 86400) return `${parseInt(s / 3600)} ${strings.hours}`;
		const day = parseInt(s / 86400);
		if (day <= 7) return `${day} ${strings.days}`;
		if (day <= 30) return `${parseInt(day / 7)} ${strings.weeks}`;
		if (day <= 365) return `${parseInt(day / 30)} ${strings.months}`;
		return `${parseInt(day / 365)} ${strings.years}`;
	};
	
    const verifyVehicle = () => {
		if (loading) return;
        if (vehicle === "") { setSession(null); return; }
		setTs(undefined);
        setLoading(true);
		setSession(undefined);
		controlInstance(auth).get(`/${vehicle}`)
		.then(response => {
			setLoading(false);
			setSession({ ...response.data, active: 1 });
		})
		.catch(error => {
			setLoading(false);
			if (error.response && error.response.status === 404)
				if (error.response.data.vehicle)
					setSession({ ...error.response.data, active: 0 });
				else
					setSession(undefined);
			else if (error.response && error.response.status === 403) {
				Alert.alert(strings.error, strings.noUser);
				auth.signOut();
				router.replace('/signIn');
			} else if (error.response && (error.response.status === 400 || error.response.status === 500)) {
				setSession(null);
				Alert.alert(strings.error, strings.connectionError);
			}
		})
		.finally(() => { loadData(); });
    };

	const HistoryPlate = (props) => (
		<TouchableOpacity
			activeOpacity={0.75}
			style={styles.historyItem}
			onPress={() => { setVehicle(props.vehicle); setSession({ ...props.details, active: props.active }); setTs(props.ts); }}
		>
			<View style={[styles.historyIconWrap, { backgroundColor: props.active ? '#eafaf1' : '#fff4e5' }]}>
				<MaterialCommunityIcons
					name={props.active ? "check-circle" : "close-circle"}
					size={resize(20)}
					color={props.active ? green : orange}
				/>
			</View>
			<View style={{ flex: 1 }}>
				<CustomTextMedium style={styles.historyPlate}>{props.vehicle}</CustomTextMedium>
				<CustomTextRegular style={styles.historyTime}>{timeAgo(props.ts * 1000)}</CustomTextRegular>
			</View>
			<MaterialIcons name="chevron-right" size={resize(18)} color={gray} />
		</TouchableOpacity>
	);

	const DetailRow = ({ icon, iconComponent, label, value, extra }) => (
		<View style={styles.detailRow}>
			<View style={styles.detailIconWrap}>
				{iconComponent || <Ionicons name={icon} size={resize(22)} color={purple} />}
			</View>
			<View style={{ flex: 1 }}>
				<CustomTextBold style={styles.detailLabel}>{label}</CustomTextBold>
				<CustomTextMedium style={styles.detailValue}>{value}</CustomTextMedium>
				{extra ? <CustomTextRegular style={styles.detailExtra}>{extra}</CustomTextRegular> : null}
			</View>
		</View>
	);
	
    return (
        <View style={styles.container}>
			<ModuleMenu
				visible={menuVisible}
				modules={userSession?.user?.modules || []}
				user={userSession?.user}
				onClose={() => setMenuVisible(false)}
				onModuleSelect={(route) => router.push(route)}
			/>
            <Stack.Screen options={{
				headerStyle: { backgroundColor: lightOrange },
				headerTintColor: black,
				statusBarColor: lightOrange,
				statusBarStyle: 'dark',
                headerRight: () => (
                    <Link href="/settings" asChild>
                        <TouchableOpacity style={{ borderRadius: resize(20), overflow: 'hidden' }}>
                            <Ionicons name="person" size={resize(32)} color={purple} />
                        </TouchableOpacity>
                    </Link>
                ),
				headerLeft: () => (
					<TouchableOpacity style={{ borderRadius: resize(20), overflow: 'hidden' }} onPress={() => setMenuVisible(true)}>
                        <MaterialIcons name="menu" size={resize(32)} color={purple} />
                    </TouchableOpacity>
				),
            }} />

			{/* Search card */}
			<View style={styles.searchCard}>
				<CustomTextInputFloating
					value={vehicle}
					autoCapitalize="characters"
					onChangeText={(e) => setVehicle(e.trim().toUpperCase())}
					style={{ ...general.fontSize10, width: '100%' }}
					styleTextInput={{ ...general.fontSize10, color: black }}
					selectionColor={purple}
					label={strings.vehicle}
					returnKeyType="search"
					onSubmitEditing={verifyVehicle}
					editable={!loading}
					rightIcon="car-sport"
					rightIconColor={orange}
					rightIconSize={resize(30)}
					rightIconBottom={resize(1)}
					rightIconRight={resize(5)}
				/>
				<CustomTextRegular style={styles.searchHint}>{strings.vehicleIEnter}</CustomTextRegular>
			</View>

			{/* Middle area — grows to fill space between search and history */}
			<View style={styles.middleArea}>

				{/* Loading */}
				{session !== null && loading ? (
					<View style={styles.centerFlex}>
						<ActivityIndicator size="large" color={purple} />
					</View>
				) : null}

				{/* Session card — status banner + detail grid */}
				{session !== null && session !== undefined && !loading ? (
					<View style={styles.detailsCard}>

						{/* Full-width status banner */}
						<View style={[styles.statusBanner, { backgroundColor: session?.active ? green : orange }]}>
							<Fontisto
								name={session?.active ? 'like' : 'dislike'}
								size={resize(28)}
								color={white}
							/>
							<View style={{ flex: 1 }}>
								<CustomTextBold style={styles.statusBannerTitle}>
									{session?.active ? strings.active : strings.inactive}
								</CustomTextBold>
								{ts ? (
									<CustomTextRegular style={styles.statusBannerSub}>
										{formatDate(ts * 1000)}  ·  {formatTime(ts * 1000)}
									</CustomTextRegular>
								) : null}
							</View>
						</View>

						{/* 3-column compact grid */}
						<View style={styles.detailsGrid}>
							{session.vehicle ? (
								<View style={styles.detailCell}>
									<CustomTextBold style={styles.detailLabel}>{strings.vehicle}</CustomTextBold>
									<CustomTextMedium style={styles.detailValue}>{session.vehicle}</CustomTextMedium>
								</View>
							) : null}
							{session.startTime ? (
								<View style={styles.detailCell}>
									<CustomTextBold style={styles.detailLabel}>{strings.startTime}</CustomTextBold>
									<CustomTextMedium style={styles.detailValue}>{formatTime(session.startTime)}</CustomTextMedium>
									<CustomTextRegular style={styles.detailExtra}>{formatDate(session.startTime)}</CustomTextRegular>
								</View>
							) : null}
							{session.endTime ? (
								<View style={styles.detailCell}>
									<CustomTextBold style={styles.detailLabel}>{strings.endTime}</CustomTextBold>
									<CustomTextMedium style={styles.detailValue}>{formatTime(session.endTime)}</CustomTextMedium>
									<CustomTextRegular style={styles.detailExtra}>{formatDate(session.endTime)}</CustomTextRegular>
								</View>
							) : null}
							{session.endTime ? (
								<View style={styles.detailCell}>
									<CustomTextBold style={styles.detailLabel}>{strings.overtime}</CustomTextBold>
									<CustomTextMedium style={styles.detailValue}>{overtime(session.endTime)}</CustomTextMedium>
								</View>
							) : null}
							{session.paid ? (
								<View style={styles.detailCell}>
									<CustomTextBold style={styles.detailLabel}>{strings.paid}</CustomTextBold>
									<CustomTextMedium style={styles.detailValue}>{session.paid} RON</CustomTextMedium>
								</View>
							) : null}
						</View>

						<View style={styles.detailDivider} />

						{/* Nota Constatare */}
						<TouchableOpacity
							activeOpacity={0.8}
							onPress={handleInspectionNote}
						disabled={!(session?.vehicle || vehicle) || session?.active === 1}
						style={[styles.notaBtn, (!(session?.vehicle || vehicle) || session?.active === 1) && styles.notaBtnDisabled]}
					>
						<View style={[styles.notaIconWrap, session?.active === 1 && styles.notaIconWrapDisabled]}>
							<MaterialCommunityIcons name="file-document-edit-outline" size={resize(20)} color={session?.active === 1 ? gray : orange} />
							</View>
							<View style={{ flex: 1 }}>
							<CustomTextMedium style={[styles.notaBtnTitle, session?.active === 1 && { color: gray }]}>{strings.notaConstatare}</CustomTextMedium>
							<CustomTextRegular style={styles.notaBtnSub}>{session?.active === 1 ? strings.active : (session?.vehicle || vehicle || '')}</CustomTextRegular>
							</View>
							<MaterialIcons name="chevron-right" size={resize(20)} color={gray} />
						</TouchableOpacity>
					</View>
				) : null}

				{/* No session */}
				{session === undefined && !loading ? (
					<View style={styles.centerFlex}>
						<MaterialIcons name="search-off" size={resize(48)} color={lightGray} />
						<CustomTextMedium style={styles.noSessionText}>{strings.noSession}</CustomTextMedium>
					</View>
				) : null}

			</View>

			{/* History — pinned at bottom */}
			<View style={styles.historySection}>
				<View style={styles.historyHeader}>
					<MaterialIcons name="history" size={resize(20)} color={orange} />
					<CustomTextMedium style={styles.historyHeaderText}>{strings.history}</CustomTextMedium>
				</View>
				<FlashList
					data={history}
					renderItem={({ item }) => <HistoryPlate {...item} />}
					estimatedItemSize={resize(52)}
					ListFooterComponent={loadingHistory ? (
						<View style={{ paddingVertical: resize(10), alignItems: 'center' }}>
							<ActivityIndicator size="small" color={purple} />
						</View>
					) : null}
				/>
			</View>
        </View>
    );
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		justifyContent: 'flex-start',
		alignItems: 'center',
		backgroundColor: lightOrange,
	},
	/* Search */
	searchCard: {
		backgroundColor: white,
		borderRadius: resize(18),
		marginHorizontal: resize(16),
		marginTop: resize(24),
		marginBottom: resize(10),
		paddingHorizontal: resize(16),
		paddingTop: resize(16),
		paddingBottom: resize(10),
		width: '90%',
		...general.shaddowLighter,
	},
	searchHint: {
		...general.fontSize4,
		color: gray,
		marginTop: resize(4),
		marginBottom: resize(4),
	},
	/* Middle area */
	middleArea: {
		flex: 1,
		width: '100%',
		alignItems: 'center',
		justifyContent: 'flex-start',
		paddingTop: resize(4),
		paddingBottom: resize(16),
	},
	centerFlex: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		gap: resize(10),
	},
	/* Status banner (inside card) */
	statusBanner: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: resize(14),
		paddingHorizontal: resize(16),
		paddingVertical: resize(14),
	},
	statusBannerTitle: {
		...general.fontSize14,
		color: white,
	},
	statusBannerSub: {
		...general.fontSize6,
		color: 'rgba(255,255,255,0.85)',
		marginTop: resize(2),
	},
	/* Details card */
	detailsCard: {
		backgroundColor: white,
		borderRadius: resize(18),
		overflow: 'hidden',
		marginHorizontal: resize(16),
		marginBottom: resize(16),
		paddingHorizontal: 0,
		paddingTop: 0,
		paddingBottom: resize(4),
		width: '90%',
		...general.shaddowLighter,
	},
	detailsGrid: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		paddingHorizontal: resize(8),
		paddingTop: resize(6),
	},
	detailCell: {
		width: '33.33%',
		paddingVertical: resize(8),
		paddingHorizontal: resize(8),
		gap: resize(2),
	},
	detailLabel: {
		...general.fontSize4,
		color: gray,
		textTransform: 'uppercase',
		letterSpacing: 0.6,
	},
	detailValue: {
		...general.fontSize10,
		color: black,
	},
	detailExtra: {
		...general.fontSize4,
		color: gray,
		marginTop: resize(1),
	},
	detailDivider: {
		height: StyleSheet.hairlineWidth,
		backgroundColor: lightGray,
		marginVertical: resize(4),
		marginHorizontal: resize(14),
	},
	/* Nota Constatare */
	notaBtn: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: resize(12),
		paddingHorizontal: resize(14),
		gap: resize(12),
	},
	notaBtnDisabled: {
		opacity: 0.45,
	},
	notaIconWrap: {
		width: resize(36),
		height: resize(36),
		borderRadius: resize(12),
		backgroundColor: '#fff4e5',
		alignItems: 'center',
		justifyContent: 'center',
	},
	notaIconWrapDisabled: {
		backgroundColor: lightGray,
	},
	notaBtnTitle: {
		...general.fontSize8,
		color: black,
	},
	notaBtnSub: {
		...general.fontSize6,
		color: gray,
		marginTop: resize(2),
	},
	/* No session */
	noSessionText: {
		...general.fontSize12,
		color: gray,
		textAlign: 'center',
		paddingHorizontal: resize(30),
	},
	/* History */
	historySection: {
		flexBasis: resize(280),
		flexShrink: 1,
		width: '100%',
		backgroundColor: white,
		borderTopLeftRadius: resize(22),
		borderTopRightRadius: resize(22),
		overflow: 'hidden',
		...general.shaddowLight,
	},
	historyHeader: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: resize(8),
		backgroundColor: purple,
		paddingVertical: resize(10),
		paddingHorizontal: resize(16),
	},
	historyHeaderText: {
		...general.fontSize8,
		color: white,
	},
	historyItem: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingHorizontal: resize(14),
		paddingVertical: resize(10),
		gap: resize(12),
		borderBottomWidth: StyleSheet.hairlineWidth,
		borderBottomColor: lightGray,
	},
	historyIconWrap: {
		width: resize(36),
		height: resize(36),
		borderRadius: resize(10),
		alignItems: 'center',
		justifyContent: 'center',
	},
	historyPlate: {
		...general.fontSize10,
		color: black,
	},
	historyTime: {
		...general.fontSize6,
		color: gray,
		marginTop: resize(2),
	},
});
