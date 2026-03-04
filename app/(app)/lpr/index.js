import {
	View,
	TouchableOpacity,
	ScrollView,
	TextInput,
	ActivityIndicator,
	FlatList,
	Image,
	Modal,
	Linking,
	Text,
	RefreshControl,
} from 'react-native';
import { MaterialIcons, AntDesign, Feather, FontAwesome5, Ionicons } from '@expo/vector-icons';
import ImageView from 'react-native-image-viewing';
import {
	purple,
	white,
	black,
	gray,
	lightGray,
	lighterMoreGray,
	orange,
	lightOrange
} from '../../../util/colors';
import { useMessage } from '../../../util/messages';
import { resize, general } from '../../../util/style';
import { CustomTextMedium, CustomTextRegular, CustomTextBold } from '../../../util/CustomText';
import { useAuth, useSession } from '../../../context/userContext';
import { lprInstance } from '../../../util/instances';
import { baseURL } from '../../../util/env';
import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';

const LIMIT = 10;

// ─── PlateCard ────────────────────────────────────────────────────────────────
const PlateCard = ({ item, strings, onInspectionNote, onVehicleLeft, isVehicleLeftLoading = false }) => {
	const [thumbnailData, setThumbnailData] = useState(null);
	const [fullImageData, setFullImageData] = useState(null);
	const [imageError, setImageError] = useState(false);
	const [showFullscreen, setShowFullscreen] = useState(false);
	const [thumbnailLoading, setThumbnailLoading] = useState(true);
	const [fullImageLoading, setFullImageLoading] = useState(false);
	const auth = useAuth();

	// Get thumbnail path (add _cropped.jpg instead of .jpg)
	const getThumbnailPath = (path) => {
		if (!path) return null;
		return path.replace(/\.jpg$/i, '_cropped.jpg');
	};

	// Fetch image with conversion to base64
	const fetchImage = (imagePath, setStateFunc, setLoadingFunc) => {
		if (!imagePath) return;
		
		lprInstance(auth)
			.get(imagePath, {
				responseType: 'arraybuffer',
			})
			.then((response) => {
				// Convert arraybuffer to base64
				const bytes = new Uint8Array(response.data);
				let binary = '';
				for (let i = 0; i < bytes.byteLength; i++) {
					binary += String.fromCharCode(bytes[i]);
				}
				const base64 = btoa(binary);
				// Store just the base64 string, not the full data URI
				setStateFunc(base64);
				if (setLoadingFunc) setLoadingFunc(false);
			})
			.catch((error) => {
				console.log('Failed to load image:', imagePath, error?.message);
				setImageError(true);
				if (setLoadingFunc) setLoadingFunc(false);
			});
	};

	// Load thumbnail on mount (only once)
	useEffect(() => {
		if (thumbnailData) return; // Already loaded
		const thumbnailPath = getThumbnailPath(item.path);
		fetchImage(thumbnailPath, setThumbnailData, setThumbnailLoading);
	}, []); // Empty dependency array - load only on mount

	// Load full image when opening fullscreen (only when modal opens)
	useEffect(() => {
		if (showFullscreen && !fullImageData && !fullImageLoading) {
			setFullImageLoading(true);
			fetchImage(item.path, setFullImageData, setFullImageLoading);
		}
	}, [showFullscreen]); // Only depend on showFullscreen

	const hasEstimated = item.latitudeEstimated != null && item.longitudeEstimated != null;

	const openMaps = (app) => {
		const lat = item.latitudeEstimated;
		const lng = item.longitudeEstimated;
		let url = '';
		if (app === 'google') {
			url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
		} else if (app === 'waze') {
			url = `https://waze.com/ul?ll=${lat},${lng}&navigate=yes`;
		}
		Linking.openURL(url).catch(() => {});
	};

	const handleInspectionNote = () => {
		if (typeof onInspectionNote === 'function') {
			onInspectionNote(item);
			return;
		}
		console.log('Nota de constatare:', item?.ID);
	};

	const handleVehicleLeft = () => {
		if (typeof onVehicleLeft === 'function') {
			onVehicleLeft(item);
			return;
		}
		console.log('Vehicul plecat:', item?.ID);
	};

	// Format timestamp (unix seconds -> milliseconds)
	const formatTime = (ts) => {
		if (!ts) return '—';
		const date = new Date(ts * 1000);
		const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
		const dayDate = date.toLocaleDateString([], { month: 'short', day: '2-digit' });
		return `${dayDate}, ${time}`;
	};

	// Format distance: if < 1 km, show in meters, otherwise show km with 2 decimals
	const formatDistance = (distanceKm) => {
		if (!distanceKm && distanceKm !== 0) return '—';
		if (distanceKm < 1) {
			const meters = Math.round(distanceKm * 1000);
			return `${meters} ${strings?.unitM}`;
		}
		return `${parseFloat(distanceKm).toFixed(2)} ${strings?.unitKm}`;
	};

	return (
		<View
			style={{
				marginHorizontal: resize(12),
				marginVertical: resize(8),
				borderRadius: resize(14),
				backgroundColor: white,
				shadowColor: '#000',
				shadowOffset: { width: 0, height: 2 },
				shadowOpacity: 0.06,
				shadowRadius: 3.84,
				elevation: 2,
				overflow: 'hidden',
			}}
		>
			{/* ── Image Header ── */}
			<View style={{ position: 'relative', height: resize(120), backgroundColor: lighterMoreGray, overflow: 'hidden' }}>
			<TouchableOpacity
				activeOpacity={0.7}
				onPress={() => setShowFullscreen(true)}
				style={{ width: '100%', height: '100%' }}
			>
				{thumbnailData && !imageError ? (
					<Image
						source={{ uri: `data:image/jpeg;base64,${thumbnailData}` }}
						style={{ width: '100%', height: '100%' }}
						resizeMode="cover"
						onError={() => setImageError(true)}
					/>
				) : (
					<View
						style={{
							width: '100%',
							height: '100%',
							justifyContent: 'center',
							alignItems: 'center',
							backgroundColor: lighterMoreGray,
						}}
					>
						<MaterialIcons name="broken-image" size={resize(40)} color={lightGray} />
					</View>
				)}
			</TouchableOpacity>
				<View
					style={{
						position: 'absolute',
						top: resize(10),
						left: resize(10),
						backgroundColor: purple,
						paddingHorizontal: resize(12),
						paddingVertical: resize(6),
						borderRadius: resize(8),
						flexDirection: 'row',
						alignItems: 'center',
						gap: resize(6),
					}}
				>
					<MaterialIcons name="directions-car" size={resize(14)} color={white} />
					<CustomTextBold style={{ ...general.fontSize11, color: white, letterSpacing: 1 }}>
						{item.plate}
					</CustomTextBold>
				</View>

				{/* ID Badge Overlay */}
				<View
					style={{
						position: 'absolute',
						top: resize(10),
						right: resize(10),
						backgroundColor: 'rgba(0, 0, 0, 0.6)',
						paddingHorizontal: resize(10),
						paddingVertical: resize(4),
						borderRadius: resize(6),
					}}
				>
					<CustomTextRegular style={{ ...general.fontSize9, color: white }}>
						#{item.ID}
					</CustomTextRegular>
				</View>
			</View>

			{/* ── Info Section ── */}
			<View style={{ paddingHorizontal: resize(14), paddingVertical: resize(12) }}>
				{/* Time */}
				<View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: resize(10) }}>
					<View
						style={{
							width: resize(32),
							height: resize(32),
							borderRadius: resize(8),
							backgroundColor: '#e8e3ff',
							justifyContent: 'center',
							alignItems: 'center',
							marginRight: resize(10),
						}}
					>
						<MaterialIcons name="access-time" size={resize(16)} color={purple} />
					</View>
					<View style={{ flex: 1 }}>
						<CustomTextRegular style={{ ...general.fontSize9, color: gray }}>
								{strings?.detectedAt}
						</CustomTextRegular>
						<CustomTextMedium style={{ ...general.fontSize10, color: black, marginTop: resize(2) }}>
							{formatTime(item.ts)}
						</CustomTextMedium>
					</View>
				</View>

				{/* Distance */}
				{item.distance != null && (
					<View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: resize(10) }}>
						<View
							style={{
								width: resize(32),
								height: resize(32),
								borderRadius: resize(8),
								backgroundColor: '#fff3e0',
								justifyContent: 'center',
								alignItems: 'center',
								marginRight: resize(10),
							}}
						>
							<MaterialIcons name="straighten" size={resize(16)} color="#ff9800" />
						</View>
						<View style={{ flex: 1 }}>
							<CustomTextRegular style={{ ...general.fontSize9, color: gray }}>
								{strings?.distance}
							</CustomTextRegular>
							<CustomTextMedium style={{ ...general.fontSize10, color: black, marginTop: resize(2) }}>
								{formatDistance(item.distance)}
							</CustomTextMedium>
						</View>
					</View>
				)}

				{/* Map Actions */}
				{hasEstimated && (
					<View
						style={{
							borderTopWidth: resize(1),
							borderTopColor: lightGray,
							paddingTopVertical: resize(12),
							marginTop: resize(10),
							paddingTop: resize(12),
						}}
					>
						<CustomTextRegular style={{ ...general.fontSize9, color: gray, marginBottom: resize(8) }}>
							{strings?.openInMaps}
						</CustomTextRegular>
						<View style={{ flexDirection: 'row', gap: resize(8) }}>
							<TouchableOpacity
								onPress={() => openMaps('google')}
								style={{
									flex: 1,
									flexDirection: 'row',
									alignItems: 'center',
									justifyContent: 'center',
									gap: resize(6),
									paddingVertical: resize(10),
									borderRadius: resize(10),
									backgroundColor: purple,
									shadowColor: purple,
									shadowOffset: { width: 0, height: 2 },
									shadowOpacity: 0.25,
									shadowRadius: 3,
									elevation: 2,
								}}
							>
								<MaterialIcons name="map" size={resize(16)} color={white} />
								<CustomTextMedium style={{ ...general.fontSize10, color: white }}>
									{strings?.googleMaps}
								</CustomTextMedium>
							</TouchableOpacity>

							<TouchableOpacity
								onPress={() => openMaps('waze')}
								style={{
									flex: 1,
									flexDirection: 'row',
									alignItems: 'center',
									justifyContent: 'center',
									gap: resize(6),
									paddingVertical: resize(10),
									borderRadius: resize(10),
									backgroundColor: orange,
									shadowColor: orange,
									shadowOffset: { width: 0, height: 2 },
									shadowOpacity: 0.25,
									shadowRadius: 3,
									elevation: 2,
								}}
							>
								<FontAwesome5 name="waze" size={resize(14)} color={white} />
								<CustomTextMedium style={{ ...general.fontSize10, color: white }}>
									{strings?.waze}
								</CustomTextMedium>
							</TouchableOpacity>
						</View>
					</View>
				)}

				{/* Plate Actions */}
				<View
					style={{
						borderTopWidth: resize(1),
						borderTopColor: lightGray,
						marginTop: resize(10),
						paddingTop: resize(12),
					}}
				>
					<CustomTextRegular style={{ ...general.fontSize9, color: gray, marginBottom: resize(8) }}>
						{strings?.actions}
					</CustomTextRegular>
					<View style={{ flexDirection: 'column', gap: resize(8) }}>
						<TouchableOpacity
							onPress={handleInspectionNote}
							style={{
								flex: 1,
								flexDirection: 'row',
								alignItems: 'center',
								justifyContent: 'center',
								gap: resize(6),
								paddingVertical: resize(10),
								borderRadius: resize(10),
								backgroundColor: 'rgba(137, 3, 80, 0.08)',
								borderWidth: 1,
								borderColor: 'rgba(137, 3, 80, 0.2)',
							}}
						>
							<MaterialIcons name="note-add" size={resize(16)} color={purple} />
							<CustomTextMedium style={{ ...general.fontSize9, color: purple }}>
								{strings?.inspectionNote}
							</CustomTextMedium>
						</TouchableOpacity>

						<TouchableOpacity
							onPress={handleVehicleLeft}
							disabled={isVehicleLeftLoading}
							style={{
								flex: 1,
								flexDirection: 'row',
								alignItems: 'center',
								justifyContent: 'center',
								gap: resize(6),
								paddingVertical: resize(10),
								borderRadius: resize(10),
								backgroundColor: lightOrange,
								borderWidth: 1,
								borderColor: 'rgba(243, 135, 19, 0.3)',
								opacity: isVehicleLeftLoading ? 0.7 : 1,
							}}
						>
							{isVehicleLeftLoading ? (
								<ActivityIndicator size="small" color={orange} />
							) : (
								<Feather name="log-out" size={resize(15)} color={orange} />
							)}
							<CustomTextMedium style={{ ...general.fontSize9, color: orange }}>
								{strings?.vehicleLeft}
							</CustomTextMedium>
						</TouchableOpacity>
					</View>
				</View>

				{/* ─── Fullscreen Image Viewer ──────────────────────────────── */}
				{showFullscreen && !fullImageData ? (
					<Modal
						visible={true}
						transparent={true}
						animationType="fade"
						onRequestClose={() => setShowFullscreen(false)}
					>
						<View style={fullscreenModalStyles.container}>
							<TouchableOpacity
								style={fullscreenModalStyles.closeButton}
								onPress={() => setShowFullscreen(false)}
							>
								<MaterialIcons name="close" size={resize(28)} color={white} />
							</TouchableOpacity>
							<View style={fullscreenModalStyles.plateBadge}>
								<CustomTextBold style={fullscreenModalStyles.plateText}>
									{item.plate}
								</CustomTextBold>
							</View>
							<View style={fullscreenModalStyles.loadingContainer}>
								<ActivityIndicator size="large" color={white} />
								<CustomTextRegular style={fullscreenModalStyles.loadingText}>
									{strings?.loading}
								</CustomTextRegular>
							</View>
						</View>
					</Modal>
				) : null}

				<ImageView
					images={fullImageData ? [{ uri: `data:image/jpeg;base64,${fullImageData}` }] : []}
					imageIndex={0}
					visible={showFullscreen && !!fullImageData}
					onRequestClose={() => setShowFullscreen(false)}
					backgroundColor="rgba(0, 0, 0, 0.98)"
					HeaderComponent={() => (
						<>
							<TouchableOpacity
								style={fullscreenModalStyles.closeButton}
								onPress={() => setShowFullscreen(false)}
							>
								<MaterialIcons name="close" size={resize(28)} color={white} />
							</TouchableOpacity>
							<View style={fullscreenModalStyles.plateBadge}>
								<CustomTextBold style={fullscreenModalStyles.plateText}>
									{item.plate}
								</CustomTextBold>
							</View>
						</>
					)}
					FooterComponent={() => (
						<View style={fullscreenModalStyles.hintContainer}>
							<CustomTextRegular style={fullscreenModalStyles.hintText}>
								{strings?.pinchToZoom}
							</CustomTextRegular>
						</View>
					)}
				/>
			</View>
		</View>
	);
};

// ─── Main Screen ──────────────────────────────────────────────────────────────
const LPRScreen = () => {
	const { LPRScreen: strings } = useMessage();
	const auth = useAuth();
	const userSession = useSession();
	const navigation = useNavigation();
	const router = useRouter();

	const [plates, setPlates] = useState([]);
	const [loading, setLoading] = useState(false);
	const [page, setPage] = useState(1);
	const [total, setTotal] = useState(0);
	const [showFilters, setShowFilters] = useState(false);
	const [errorMessage, setErrorMessage] = useState('');
	const [refreshing, setRefreshing] = useState(false);
	const [vehicleLeftLoadingId, setVehicleLeftLoadingId] = useState(null);
	const hasInitialized = useRef(false);
	const flatListRef = useRef(null);

	// Set header options with filter button
	useEffect(() => {
		navigation.setOptions({
			headerRight: () => (
				<TouchableOpacity
					onPress={() => setShowFilters(true)}
				>
					<Ionicons name="settings-sharp" size={resize(30)} color={white} />
				</TouchableOpacity>
			),
		});
	}, [navigation]);

	// Filter states
	const [search, setSearch] = useState('');
	const [radius, setRadius] = useState('');
	const [tsdelta, setTsdelta] = useState('');

	// Memoize location values to prevent infinite re-fetches
	const latitude = useMemo(() => userSession?.location?.latitude?.toString() || '', [userSession?.location?.latitude]);
	const longitude = useMemo(() => userSession?.location?.longitude?.toString() || '', [userSession?.location?.longitude]);

	const totalPages = Math.max(1, Math.ceil(total / LIMIT));

	const handleInspectionNote = useCallback(
		(plateItem) => {
			const licensePlate = plateItem?.plate ? String(plateItem.plate) : '';
			console.log('Navigating to inspection note for plate:', plateItem.ID);
			router.push({
				pathname: '/nota-constatare',
				params: {
					license_plate: licensePlate,
					lpr_id: plateItem?.ID != null ? String(plateItem.ID) : undefined,
					image_path: plateItem?.path != null ? String(plateItem.path) : undefined,
					source: 'lpr',
					preset_violation_type: 'unpaid_parking',
					preset_violation_code: 'unpaid_parking',
					lock_violation_type: '1',
				},
			});
		},
		[router]
	);

	const fetchPlates = useCallback(
		(pageNum = 1) => {
			setLoading(true);
			setErrorMessage('');

			const params = {};
			if (search) params.search = search;
			if (radius) params.radius = radius;
			if (tsdelta) params.tsdelta = tsdelta;
			if (latitude) params.latitude = latitude;
			if (longitude) params.longitude = longitude;

			lprInstance(auth)
				.get(`/plates/${pageNum}/${LIMIT}`, { params })
				.then((response) => {
					let newPlates = [];
					let newTotal = 0;

					if (response.data?.plates && Array.isArray(response.data.plates)) {
						newPlates = response.data.plates;
						newTotal = response.data.total ?? newPlates.length;
					} else if (Array.isArray(response.data)) {
						newPlates = response.data;
						newTotal = newPlates.length;
					}
					
					setPlates(newPlates);
					setTotal(newTotal);
					setPage(pageNum);

					if (newPlates.length === 0) {
						setErrorMessage(strings?.noData);
					}
				})
				.catch((error) => {
					if (error.response?.status === 404) {
						setErrorMessage(strings?.notFound);
					} else if (error.response?.status === 403) {
						setErrorMessage(strings?.forbidden);
					} else if (error.message === 'Network Error') {
						setErrorMessage(strings?.networkError);
					} else {
						setErrorMessage(strings?.loadError);
					}
					setPlates([]);
					setTotal(0);
				})
				.finally(() => {
					setLoading(false);
				});
		},
		[auth, strings, latitude, longitude]
	);

	const handleVehicleLeft = useCallback(
		(plateItem) => {
			if (!plateItem?.ID) return;
			setVehicleLeftLoadingId(plateItem.ID);
			setErrorMessage('');

			lprInstance(auth)
				.post('/plate/left_crime_scene', { plateID: plateItem.ID })
				.then(() => {
					setPlates((currentPlates) =>
						currentPlates.filter((currentPlate) => currentPlate?.ID !== plateItem.ID)
					);
					setTotal((currentTotal) => Math.max(0, currentTotal - 1));

					if (page === 1) {
						fetchPlates(1);
					} else {
						setPage(1);
					}
				})
				.catch((error) => {
					if (error.response?.status === 403) {
						setErrorMessage(strings?.forbidden);
					} else if (error.message === 'Network Error') {
						setErrorMessage(strings?.networkError);
					} else {
						setErrorMessage(strings?.loadError);
					}
				})
				.finally(() => {
					setVehicleLeftLoadingId((currentId) =>
						currentId === plateItem.ID ? null : currentId
					);
				});
		},
		[auth, fetchPlates, page, strings]
	);

	useEffect(() => {
		if (!hasInitialized.current) {
			hasInitialized.current = true;
			fetchPlates(1);
		}
	}, []);

	// Fetch plates when page changes
	useEffect(() => {
		if (hasInitialized.current) {
			fetchPlates(page);
			// Scroll to top
			flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
		}
	}, [page]);

	useFocusEffect(
		useCallback(() => {
			// Refetch when screen is focused
			if (hasInitialized.current && page === 1) {
				fetchPlates(1);
			}
		}, [])
	);

	// Update refreshing state when loading completes
	useEffect(() => {
		if (refreshing && !loading) {
			setRefreshing(false);
		}
	}, [loading, refreshing]);

	const handleApplyFilters = () => {
		setPage(1);
		fetchPlates(1);
		setShowFilters(false);
	};

	const handleResetFilters = () => {
		setSearch('');
		setRadius('');
		setTsdelta('');
	};

	const handleRefresh = () => {
		setRefreshing(true);
		setPage(1);
		// Fetch will be called by the useEffect triggered by page change
		// refreshing state is managed by the loading state above
	};

	// ─── Select Input (Dropdown) ───────────────────────────────────────────
	const SelectInput = ({ label, value, onChange, options }) => {
		const [showDropdown, setShowDropdown] = useState(false);

		return (
			<View style={{ marginBottom: resize(14) }}>
				<CustomTextMedium style={{ ...general.fontSize10, color: black, marginBottom: resize(5) }}>
					{label}
				</CustomTextMedium>
				<TouchableOpacity
					onPress={() => setShowDropdown(!showDropdown)}
					style={{
						borderWidth: 1,
						borderColor: lightGray,
						borderRadius: resize(8),
						paddingHorizontal: resize(12),
						paddingVertical: resize(10),
						backgroundColor: white,
						flexDirection: 'row',
						justifyContent: 'space-between',
						alignItems: 'center',
					}}
				>
					<CustomTextRegular
						style={{
							...general.fontSize10,
							color: value ? black : gray,
						}}
					>
						{value
							? (options.find((opt) => opt.value === value)?.label ?? strings?.select)
							: strings?.all}
					</CustomTextRegular>
					<MaterialIcons
						name={showDropdown ? 'expand-less' : 'expand-more'}
						size={resize(20)}
						color={gray}
					/>
				</TouchableOpacity>

				{showDropdown && (
					<View
						style={{
							marginTop: resize(4),
							borderWidth: 1,
							borderColor: lightGray,
							borderRadius: resize(8),
							backgroundColor: white,
							elevation: 5,
							shadowColor: '#000',
							shadowOffset: { width: 0, height: 2 },
							shadowOpacity: 0.1,
							shadowRadius: 3,
							zIndex: 1000,
						}}
					>
						{/* All option */}
						<TouchableOpacity
							onPress={() => {
								onChange('');
								setShowDropdown(false);
							}}
							style={{
								paddingHorizontal: resize(12),
								paddingVertical: resize(10),
								borderBottomWidth: 1,
								borderBottomColor: lightGray,
							}}
						>
							<CustomTextRegular style={{ ...general.fontSize10, color: black }}>
								{strings?.all}
							</CustomTextRegular>
						</TouchableOpacity>

						{/* Other options */}
						{options.map((option) => (
							<TouchableOpacity
								key={option.value}
								onPress={() => {
									onChange(option.value);
									setShowDropdown(false);
								}}
								style={{
									paddingHorizontal: resize(12),
									paddingVertical: resize(10),
									borderBottomWidth: 1,
									borderBottomColor: lightGray,
									backgroundColor: value === option.value ? '#f0f0f0' : white,
								}}
							>
								<CustomTextRegular style={{ ...general.fontSize10, color: black }}>
									{option.label}
								</CustomTextRegular>
							</TouchableOpacity>
						))}
					</View>
				)}
			</View>
		);
	};

	// ─── Pagination Bar ────────────────────────────────────────────────────
	const PaginationBar = () => (
		<View
			style={{
				flexDirection: 'row',
				alignItems: 'center',
				justifyContent: 'space-between',
				paddingVertical: resize(10),
				paddingHorizontal: resize(20),
				borderTopWidth: 1,
				borderTopColor: lightGray,
				backgroundColor: white,
			}}
		>
			<TouchableOpacity
			onPress={() => {
				if (page > 1 && !loading) {
					fetchPlates(page - 1);
				}
			}}
			disabled={page <= 1 || loading}
			style={{
					flexDirection: 'row',
					alignItems: 'center',
					justifyContent: 'center',
				paddingHorizontal: resize(12),
				paddingVertical: resize(8),
				borderRadius: resize(8),
				backgroundColor: page <= 1 || loading ? lighterMoreGray : white,
				borderWidth: resize(2),
				borderColor: page <= 1 || loading ? lightGray : purple,
			}}
		>
				<MaterialIcons name="chevron-left" size={resize(24)} color={page <= 1 || loading ? gray : purple} />
			</TouchableOpacity>

			<View style={{ alignItems: 'center' }}>
				<CustomTextBold style={{ ...general.fontSize10, color: black }}>
					{strings?.page} {page} / {totalPages}
				</CustomTextBold>
				<CustomTextRegular style={{ ...general.fontSize8, color: gray }}>
					{total} {strings?.totalRecords}
				</CustomTextRegular>
			</View>

			<TouchableOpacity
				onPress={() => {
					if (page < totalPages && !loading) {
						fetchPlates(page + 1);
					}
				}}
				disabled={page >= totalPages || loading}
				style={{
					flexDirection: 'row',
					alignItems: 'center',
					justifyContent: 'center',
					paddingHorizontal: resize(12),
					paddingVertical: resize(8),
					borderRadius: resize(8),
					backgroundColor: page >= totalPages || loading ? lighterMoreGray : white,
					borderWidth: resize(2),
					borderColor: page >= totalPages || loading ? lightGray : purple,
				}}
			>
				<MaterialIcons name="chevron-right" size={resize(24)} color={page >= totalPages || loading ? gray : purple} />
			</TouchableOpacity>
		</View>
	);

	// ─── Render ────────────────────────────────────────────────────────────
	return (
		<View style={{ flex: 1, backgroundColor: white }}>
			{/* ── Filter Modal ── */}
			<Modal visible={showFilters} transparent={false} animationType="slide">
				<View style={{ flex: 1, backgroundColor: white }}>
					{/* Modal Header */}
					<View
						style={{
							flexDirection: 'row',
							justifyContent: 'space-between',
							alignItems: 'center',
							paddingHorizontal: resize(15),
							paddingVertical: resize(14),
							paddingTop: resize(50),
							backgroundColor: white,
							borderBottomWidth: 1,
							borderBottomColor: lightGray,
						}}
					>
						<CustomTextBold style={{ ...general.fontSize14, color: black }}>
							{strings?.filters}
						</CustomTextBold>
						<TouchableOpacity onPress={() => setShowFilters(false)}>
							<AntDesign name="close" size={resize(22)} color={black} />
						</TouchableOpacity>
					</View>

					<ScrollView 
						style={{ flex: 1, padding: resize(15) }} 
						showsVerticalScrollIndicator={false}
						keyboardShouldPersistTaps="handled"
					>
						<View style={{ marginBottom: resize(14) }}>
							<CustomTextMedium style={{ ...general.fontSize10, color: black, marginBottom: resize(5) }}>
								{strings?.search}
							</CustomTextMedium>
							<TextInput
								style={{
									borderWidth: 1,
									borderColor: lightGray,
									borderRadius: resize(8),
									paddingHorizontal: resize(12),
									paddingVertical: resize(10),
									color: black,
									backgroundColor: white,
									...general.fontSize10,
								}}
								placeholder={strings?.platePlaceholder}
								placeholderTextColor={gray}
								value={search}
								onChangeText={(text) => setSearch(text.replace(/[^a-zA-Z0-9]/g, '').toUpperCase())}
								autoCapitalize="characters"
								autoCorrect={false}
							/>
						</View>
						<SelectInput
							label={strings?.radius}
							value={radius}
							onChange={setRadius}
							options={[
								{ value: '1', label: `1 ${strings?.unitKm}` },
								{ value: '2', label: `2 ${strings?.unitKm}` },
								{ value: '3', label: `3 ${strings?.unitKm}` },
								{ value: '4', label: `4 ${strings?.unitKm}` },
								{ value: '5', label: `5 ${strings?.unitKm}` },
								{ value: '10', label: `10 ${strings?.unitKm}` },
							]}
						/>
						<SelectInput
							label={strings?.timeDelta}
							value={tsdelta}
							onChange={setTsdelta}
							options={[
								{ value: '5', label: `5 ${strings?.unitMin}` },
								{ value: '10', label: `10 ${strings?.unitMin}` },
								{ value: '30', label: `30 ${strings?.unitMin}` },
								{ value: '60', label: `60 ${strings?.unitMin}` },
							]}
						/>

						{/* Read-only GPS fields */}
						{[
							{ label: strings?.latitude, val: latitude },
							{ label: strings?.longitude, val: longitude },
						].map(({ label, val }) => (
							<View key={label} style={{ marginBottom: resize(14) }}>
								<CustomTextMedium
									style={{ ...general.fontSize10, color: black, marginBottom: resize(5) }}
								>
									{label}
								</CustomTextMedium>
								<View
									style={{
										borderWidth: 1,
										borderColor: lightGray,
										borderRadius: resize(8),
										paddingHorizontal: resize(12),
										paddingVertical: resize(10),
										backgroundColor: '#f0f0f0',
									}}
								>
									<CustomTextRegular style={{ ...general.fontSize10, color: gray }}>
										{val || '—'}
									</CustomTextRegular>
								</View>
							</View>
						))}
					</ScrollView>

					{/* Modal Footer */}
					<View
						style={{
							flexDirection: 'row',
							gap: resize(10),
							paddingHorizontal: resize(15),
							paddingVertical: resize(15),
							borderTopWidth: 1,
							borderTopColor: lightGray,
							backgroundColor: white,
						}}
					>
						<TouchableOpacity
							style={{
								flex: 1,
								paddingVertical: resize(12),
								borderRadius: resize(8),
								borderWidth: 1,
								borderColor: purple,
								justifyContent: 'center',
								alignItems: 'center',
							}}
							onPress={handleResetFilters}
						>
							<CustomTextMedium style={{ ...general.fontSize11, color: purple }}>
								{strings?.reset}
							</CustomTextMedium>
						</TouchableOpacity>
						<TouchableOpacity
							style={{
								flex: 2,
								paddingVertical: resize(12),
								borderRadius: resize(8),
								backgroundColor: purple,
								justifyContent: 'center',
								alignItems: 'center',
							}}
							onPress={handleApplyFilters}
						>
							<CustomTextMedium style={{ ...general.fontSize11, color: white }}>
								{strings?.apply}
							</CustomTextMedium>
						</TouchableOpacity>
					</View>
				</View>
			</Modal>

			{/* ── Error Banner ── */}
			{errorMessage ? (
				<View
					style={{
						marginHorizontal: resize(20),
						marginTop: resize(10),
						paddingHorizontal: resize(12),
						paddingVertical: resize(10),
						borderColor: lightGray,
						borderWidth: 1,
						borderRadius: resize(6),
					}}
				>
					<CustomTextRegular style={{ ...general.fontSize10, color: black }}>
						{errorMessage}
					</CustomTextRegular>
				</View>
			) : null}

			{/* ── Content ── */}
			{loading && plates.length === 0 ? (
				<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
					<ActivityIndicator size="large" color={purple} />
				</View>
			) : plates.length === 0 && !loading ? (
				<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
					<MaterialIcons name="image-search" size={resize(80)} color={gray} />
					<CustomTextMedium style={{ marginTop: resize(16), ...general.fontSize12, color: gray }}>
						{strings?.noData}
					</CustomTextMedium>
				</View>
			) : (
				<>
					<FlatList
						ref={flatListRef}
						data={plates}
						renderItem={({ item }) => (
							<PlateCard
								item={item}
								strings={strings}
								onInspectionNote={handleInspectionNote}
								onVehicleLeft={handleVehicleLeft}
								isVehicleLeftLoading={vehicleLeftLoadingId === item?.ID}
							/>
						)}
						keyExtractor={(item) =>
							item.ID != null ? item.ID.toString() : Math.random().toString()
						}
						contentContainerStyle={{ paddingHorizontal: resize(8), paddingVertical: resize(8) }}
						showsVerticalScrollIndicator={false}
						refreshControl={
							<RefreshControl
								refreshing={refreshing || (loading && page === 1)}
								onRefresh={handleRefresh}
								tintColor={purple}
								colors={[purple]}
							/>
						}
						ListFooterComponent={
							loading && page !== 1 ? (
								<View style={{ paddingVertical: resize(20), alignItems: 'center' }}>
									<ActivityIndicator size="large" color={purple} />
								</View>
							) : null
						}
					/>
					<PaginationBar />
				</>
			)}
		</View>
	);
};

// ─── Fullscreen Modal Styles ─────────────────────────────────────────────────
const fullscreenModalStyles = {
	container: {
		flex: 1,
		backgroundColor: 'rgba(0, 0, 0, 0.98)',
	},
	closeButton: {
		position: 'absolute',
		top: resize(50),
		right: resize(20),
		width: resize(50),
		height: resize(50),
		borderRadius: resize(25),
		backgroundColor: 'rgba(255, 255, 255, 0.2)',
		justifyContent: 'center',
		alignItems: 'center',
		zIndex: 10,
	},
	plateBadge: {
		position: 'absolute',
		top: resize(50),
		left: resize(20),
		backgroundColor: purple,
		paddingHorizontal: resize(16),
		paddingVertical: resize(10),
		borderRadius: resize(10),
		zIndex: 10,
	},
	plateText: {
		color: white,
		fontSize: resize(14),
		letterSpacing: 1,
	},
	loadingContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
	},
	loadingText: {
		marginTop: resize(16),
		color: white,
		fontSize: resize(12),
	},
	hintContainer: {
		position: 'absolute',
		bottom: resize(40),
		left: 0,
		right: 0,
		alignItems: 'center',
		zIndex: 10,
	},
	hintText: {
		color: 'rgba(255, 255, 255, 0.7)',
		fontSize: resize(11),
		backgroundColor: 'rgba(0, 0, 0, 0.6)',
		paddingHorizontal: resize(20),
		paddingVertical: resize(8),
		borderRadius: resize(20),
	},
};

export default LPRScreen;
