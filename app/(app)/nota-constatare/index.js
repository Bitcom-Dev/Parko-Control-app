import { View, ScrollView, TouchableOpacity, TextInput, ActivityIndicator, Switch, Platform, Image, Modal, Alert, Dimensions } from 'react-native';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { resize, general } from '../../../util/style';
import { purple, white, black, gray, lightGray, lighterMoreGray, orange, lightOrange } from '../../../util/colors';
import useMessage from '../../../util/messages';
import { CustomTextMedium, CustomTextRegular, CustomTextBold } from '../../../util/CustomText';
import { useAuth, useSession } from '../../../context/userContext';
import { lprInstance, notaConstatareInstance } from '../../../util/instances';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Stack, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import DateTimePicker from '@react-native-community/datetimepicker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system/legacy';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as jpeg from 'jpeg-js';
import { Buffer } from 'buffer';
import { setPrintPreview } from '../../../util/printPreviewStore';
import { getLocationLabelFromCoords } from '../../../util/reverseGeocode';

const NotaConstatareScreen = () => {
	const DEFAULT_STRING_MASK = '_______________';
	const STRING_MASK_EXCLUDED_KEYS = new Set(['days_to_due', 'POZA_MASINA_BASE64']);

	const { NotaConstatareScreen: strings } = useMessage();
	const auth = useAuth();
	const { user } = useSession();
	const authRef = useRef(auth);
	const params = useLocalSearchParams();
	const presetRef = useRef({ enabled: false, code: 'unpaid_parking', lock: true });

	useEffect(() => {
		// jpeg-js relies on global Buffer (RN doesn't always provide it)
		if (typeof global !== 'undefined' && !global.Buffer) {
			global.Buffer = Buffer;
		}
	}, []);

	const normalizeLicensePlate = (raw) => {
		if (raw === null || raw === undefined) return '';
		return String(raw)
			.replace(/[^a-zA-Z0-9]/g, '')
			.toUpperCase();
	};

	const stripDiacritics = (value) => {
		if (value === null || value === undefined) return value;
		if (typeof value !== 'string') return value;
		return value
			.normalize('NFD')
			.replace(/[\u0300-\u036f]/g, '')
			.replace(/ł/g, 'l')
			.replace(/Ł/g, 'L');
	};

	const normalizeSearchToken = useCallback((value) => {
		return String(stripDiacritics(value) || '')
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '_')
			.replace(/^_+|_+$/g, '');
	}, []);

	const agentConstatatorName = useMemo(() => {
		const fullName = user?.fullName || user?.fullname || user?.name;
		if (typeof fullName === 'string' && fullName.trim()) {
			return stripDiacritics(fullName).trim();
		}

		const fallbackName = [user?.firstName, user?.lastName]
			.filter((item) => typeof item === 'string' && item.trim())
			.join(' ')
			.trim();

		return fallbackName ? stripDiacritics(fallbackName) : '';
	}, [user]);

	const isAgentConstatatorRequirement = useCallback((requirement) => {
		const key = normalizeSearchToken(requirement?.value);
		const label = normalizeSearchToken(requirement?.label);

		const exactMatches = new Set([
			'agent_constatator',
			'nume_agent',
			'nume_agent_constatator',
			'numele_agentului_constatator',
		]);

		if (exactMatches.has(key) || exactMatches.has(label)) return true;

		const combinedMatches = [key, label].some((token) => {
			if (!token) return false;
			const hasAgent = token.includes('agent');
			const hasConstatator = token.includes('constatator');
			const hasName = token.includes('nume');
			return (hasAgent && hasConstatator) || (hasAgent && hasName);
		});

		return combinedMatches;
	}, [normalizeSearchToken]);

	const getViolationValueForRequirement = useCallback((violation, requirementKey, usePjVariant = false) => {
		if (!violation || !requirementKey) return undefined;

		const keyMap = {
			amount: 'default_fine_amount',
			min_fine_amount: 'min_fine_amount',
			max_fine_amount: 'max_fine_amount',
			fine_point_amount: 'fine_point_amount',
		};

		const baseKey = keyMap[String(requirementKey)] || String(requirementKey);

		if (usePjVariant) {
			const pjKey = `${baseKey}_pj`;
			const pjValue = violation?.[pjKey];
			if (pjValue !== null && pjValue !== undefined) {
				return pjValue;
			}
		}

		return violation?.[baseKey];
	}, []);

	const formatDaysToDueValue = useCallback((rawValue) => {
		if (rawValue === '' || rawValue === null || rawValue === undefined) return '';

		const rawString = String(rawValue).trim();
		if (!rawString) return '';

		const numericCandidate = rawString.replace(',', '.');
		if (!/^-?\d+(\.\d+)?$/.test(numericCandidate)) {
			return rawString;
		}

		const numericValue = Number(numericCandidate);
		if (!Number.isFinite(numericValue)) return rawString;

		const hoursLabel = strings?.unitHours || 'hours';
		const daysLabel = strings?.unitDays || 'days';

		if (numericValue <= 1) {
			const roundedHours = numericValue > 0 ? Math.max(1, Math.round(numericValue * 24)) : 0;
			return `${roundedHours} ${hoursLabel}`;
		}

		const roundedDays = Math.max(1, Math.round(numericValue));
		return `${roundedDays} ${daysLabel}`;
	}, [strings?.unitDays, strings?.unitHours]);

	useEffect(() => {
		authRef.current = auth;
	}, [auth]);

	useEffect(() => {
		const source = params?.source || params?.from || params?.origin;
		const hasNonMenuSignal = Boolean(
			source ||
			params?.license_plate ||
			params?.plate ||
			params?.lpr_id ||
			params?.camera_id ||
			params?.scan_id
		);

		const presetCode = params?.preset_violation_type || params?.preset_violation_code || 'unpaid_parking';
		const lock = params?.lock_violation_type === '1' || params?.lock_violation_type === 'true' || params?.lock_violation_type === true;

		presetRef.current = {
			enabled: hasNonMenuSignal && source !== 'menu',
			code: typeof presetCode === 'string' ? presetCode : String(presetCode),
			lock,
		};
	}, [params]);

	// State for violation codes
	const [violationCodes, setViolationCodes] = useState([]);
	const [selectedViolation, setSelectedViolation] = useState(null);
	const [loadingCodes, setLoadingCodes] = useState(true);
	const [errorCodes, setErrorCodes] = useState(null);
	const [violationTypeLocked, setViolationTypeLocked] = useState(false);

	// State for requirements
	const [requirements, setRequirements] = useState([]);
	const [loadingRequirements, setLoadingRequirements] = useState(false);
	const [errorRequirements, setErrorRequirements] = useState(null);

	// State for form values
	const [formValues, setFormValues] = useState({});
	const [lockedFields, setLockedFields] = useState({});

	// State for dropdown visibility
	const [showDropdown, setShowDropdown] = useState(false);
	const [permission, requestPermission] = useCameraPermissions();
	const cameraRef = useRef(null);

	// Photo state (base64 string, without data uri prefix)
	const [photoSourceBase64, setPhotoSourceBase64] = useState(null);
	const [photoBase64, setPhotoBase64] = useState(null);
	const [photoLoading, setPhotoLoading] = useState(false);
	const [photoError, setPhotoError] = useState('');
	const [cameraVisible, setCameraVisible] = useState(false);
	const [submitting, setSubmitting] = useState(false);

	// State for date/time pickers
	const [showDatePicker, setShowDatePicker] = useState(null);
	const [showTimePicker, setShowTimePicker] = useState(null);

	// Fetch violation codes on mount
	const fetchViolationCodes = useCallback(() => {
		setLoadingCodes(true);
		setErrorCodes(null);

		const matchesPreset = (candidate, wantedLower) => {
			const vtype = (candidate?.violation_type || candidate?.violationType || '').toString().trim().toLowerCase();
			const code = (candidate?.code || '').toString().trim().toLowerCase();
			return vtype === wantedLower || code === wantedLower;
		};

		notaConstatareInstance(authRef.current)
			.get('/get_violation_codes')
			.then((response) => {
				// Filter only active violation codes
				const activeCodes = response.data.filter((code) => code.is_active);
				setViolationCodes(activeCodes);
				// console.log('Fetched violation codes:', activeCodes);

				const preset = presetRef.current;
				if (preset?.enabled && !selectedViolation) {
					const wanted = (preset.code || '').toString().trim().toLowerCase();
					const match = activeCodes.find((c) => matchesPreset(c, wanted));
					if (match) {
						setSelectedViolation(match);
						setShowDropdown(false);
						setViolationTypeLocked(Boolean(preset.lock));
					}
				}

				setLoadingCodes(false);
			})
			.catch((error) => {
				console.error('Error fetching violation codes:', error);
				setErrorCodes(strings?.loadError || 'Failed to load data');
				setLoadingCodes(false);
			});
	}, [strings?.loadError, selectedViolation]);

	useFocusEffect(
		useCallback(() => {
			fetchViolationCodes();
		}, [fetchViolationCodes])
	);

	// Fetch requirements when a violation code is selected
	useEffect(() => {
		if (selectedViolation?.id) {
			setLoadingRequirements(true);
			setErrorRequirements(null);
			setFormValues({});
			setLockedFields({});

			notaConstatareInstance(authRef.current)
				.get(`/${selectedViolation.id}/requirements`)
				.then((response) => {
					setRequirements(response.data);
					// Initialize form values; prefill + lock when requirement.value exists in selectedViolation
					const initialValues = {};
					const initialLocked = {};
					const hasPjBooleanRequirement = response.data.some(
						(req) => req?.type === 'BOOLEAN' && req?.value === 'PJ'
					);
					const initialPjEnabled = hasPjBooleanRequirement && Boolean(selectedViolation?.PJ);

					const licensePlatePrefill =
						params?.license_plate ||
						params?.plate ||
						params?.vehicle ||
						params?.vehicleSelected ||
						params?.nr_auto ||
						params?.NR_AUTO ||
						'';

					const normalizedLicensePlate =
						typeof licensePlatePrefill === 'string' ? licensePlatePrefill : String(licensePlatePrefill);

					const coercePrefillValue = (type, rawValue) => {
						if (rawValue === null || rawValue === undefined) return rawValue;
						if (type === 'BOOLEAN') return Boolean(rawValue);
						if (type === 'INT') return typeof rawValue === 'number' ? Math.trunc(rawValue) : rawValue;
						if (type === 'FLOAT') return typeof rawValue === 'number' ? rawValue : rawValue;
						if (type === 'TIMESTAMP' || type === 'ISO_STRING') {
							if (rawValue instanceof Date) return rawValue;
							if (typeof rawValue === 'number') {
								// seconds or milliseconds
								return new Date(rawValue < 1e12 ? rawValue * 1000 : rawValue);
							}
							const parsed = new Date(rawValue);
							return isNaN(parsed.getTime()) ? new Date() : parsed;
						}
						return rawValue;
					};

					response.data.forEach((req) => {
						const key = req.value;
						const mappedViolationValue = getViolationValueForRequirement(
							selectedViolation,
							key,
							initialPjEnabled
						);

						// Special rules
						if (key === 'ts') {
							initialValues[key] = new Date();
							initialLocked[key] = true;
							return;
						}

						if (key === 'license_plate' && normalizedLicensePlate) {
							initialValues[key] = normalizeLicensePlate(normalizedLicensePlate);
							// editable on purpose
							return;
						}

						if (
							String(req?.type || '').toUpperCase() === 'STRING' &&
							agentConstatatorName &&
							isAgentConstatatorRequirement(req)
						) {
							initialValues[key] = agentConstatatorName;
							return;
						}

						if (key === 'amount' && mappedViolationValue !== null && mappedViolationValue !== undefined) {
							initialValues[key] = coercePrefillValue(req.type, mappedViolationValue);
							// editable on purpose
							return;
						}

						if (key === 'days_to_due') {
							const fromViolation = selectedViolation?.days_to_due;
							if (fromViolation !== null && fromViolation !== undefined) {
								initialValues[key] = formatDaysToDueValue(fromViolation);
								initialLocked[key] = true;
								return;
							}
						}

						if (mappedViolationValue !== null && mappedViolationValue !== undefined) {
							initialValues[key] = coercePrefillValue(req.type, mappedViolationValue);
							initialLocked[key] = true;
							return;
						}

						if (req.type === 'BOOLEAN') {
							initialValues[key] = false;
						} else if (req.type === 'INT' && key === 'PUNCTE_PENALIZARE') {
							initialValues[key] = 0;
						} else if (req.type === 'TIMESTAMP' || req.type === 'ISO_STRING') {
							initialValues[key] = new Date();
						} else if (String(req.type || '').toUpperCase() === 'STRING') {
							initialValues[key] = '';
						} else {
							initialValues[key] = '';
						}
					});

					const hasAvertismentBoolean = response.data.some(
						(req) => req?.type === 'BOOLEAN' && req?.value === 'AVERTISMENT'
					);
					const hasAmendaBoolean = response.data.some(
						(req) => req?.type === 'BOOLEAN' && req?.value === 'AMENDA'
					);
					if (hasAvertismentBoolean && hasAmendaBoolean) {
						initialValues.AVERTISMENT = true;
						initialValues.AMENDA = false;
					}
					setFormValues(initialValues);
					setLockedFields(initialLocked);
					setLoadingRequirements(false);
				})
				.catch((error) => {
					console.error('Error fetching requirements:', error);
					setErrorRequirements(strings?.loadError || 'Failed to load data');
					setLoadingRequirements(false);
				});
		} else {
			setRequirements([]);
			setFormValues({});
			setLockedFields({});
		}
	}, [selectedViolation, strings?.loadError, formatDaysToDueValue, getViolationValueForRequirement, agentConstatatorName, isAgentConstatatorRequirement]);

	const hasLocFaptaRequirement = useMemo(
		() => requirements.some((req) => req?.value === 'LOC_FAPTA'),
		[requirements]
	);

	useEffect(() => {
		if (!selectedViolation?.id) return;
		if (!hasLocFaptaRequirement) return;
		if (Boolean(lockedFields?.LOC_FAPTA)) return;

		const currentLoc = typeof formValues?.LOC_FAPTA === 'string' ? formValues.LOC_FAPTA.trim() : '';
		if (currentLoc) return;

		let cancelled = false;

		(async () => {
			try {
				const { lat, long } = await getDeviceCoordinates();
				if (cancelled) return;

				const locationLabel = await getLocationLabelFromCoords(lat, long);
				if (cancelled || !locationLabel) return;

				setFormValues((prev) => {
					const existing = typeof prev?.LOC_FAPTA === 'string' ? prev.LOC_FAPTA.trim() : '';
					if (existing) return prev;
					return {
						...prev,
						LOC_FAPTA: locationLabel,
					};
				});
			} catch (error) {
				console.log('LOC_FAPTA autofill skipped:', error?.message);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [selectedViolation?.id, hasLocFaptaRequirement, lockedFields?.LOC_FAPTA, formValues?.LOC_FAPTA, getDeviceCoordinates]);

	const requiresPhoto = (() => {
		const raw = selectedViolation?.requires_photo ?? selectedViolation?.requiresPhoto;
		if (raw === true) return true;
		if (raw === false) return false;
		if (raw === 1 || raw === '1') return true;
		if (typeof raw === 'string') return raw.toLowerCase() === 'true';
		return Boolean(raw);
	})();

	const setPhotoAndBind = useCallback((base64) => {
		if (!base64) {
			setPhotoSourceBase64(null);
			setPhotoBase64(null);
			setPhotoLoading(false);
			setFormValues((prev) => ({
				...prev,
				POZA_MASINA_BASE64: '',
			}));
			return;
		}
		setPhotoError('');
		setPhotoLoading(true);
		setPhotoSourceBase64(String(base64));
		setPhotoBase64(null);
	}, []);

	const fetchImageAsBase64 = useCallback(
		(imagePath) => {
			if (!imagePath) return Promise.reject(new Error('Missing image path'));
			return lprInstance(authRef.current)
				.get(String(imagePath), { responseType: 'arraybuffer' })
				.then((response) => {
					const bytes = new Uint8Array(response.data);
					let binary = '';
					for (let i = 0; i < bytes.byteLength; i++) {
						binary += String.fromCharCode(bytes[i]);
					}
					return btoa(binary);
				});
		},
		[]
	);

	// Prefill photo from LPR when required
	useEffect(() => {
		if (!selectedViolation?.id) return;
		if (!requiresPhoto) return;
		if (photoSourceBase64) return;
		const source = params?.source || params?.from || params?.origin;
		if (source !== 'lpr') return;
		const imagePath = params?.image_path;
		if (!imagePath) return;

		setPhotoLoading(true);
		setPhotoError('');
		let cancelled = false;
		(async () => {
			try {
				const base64 = await fetchImageAsBase64(imagePath);
				if (cancelled) return;
				setPhotoAndBind(base64);
			} catch (err) {
				console.log('Failed to prefill LPR photo:', err?.message);
				if (!cancelled) {
					setPhotoError(strings?.photoLoadError || 'Failed to load photo');
					setPhotoLoading(false);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [params, selectedViolation?.id, requiresPhoto, photoSourceBase64, fetchImageAsBase64, setPhotoAndBind, strings?.photoLoadError]);

	const openCamera = useCallback(async () => {
		if (!permission?.granted) {
			const res = await requestPermission();
			if (!res?.granted) {
				Alert.alert(strings?.error || 'Error', strings?.cameraPermissionRequired || 'Camera permission required');
				return;
			}
		}
		setCameraVisible(true);
	}, [permission?.granted, requestPermission, strings?.cameraPermissionRequired, strings?.error]);

	const takePhotoNow = useCallback(async () => {
		try {
			if (!cameraRef.current) return;
			setPhotoError('');
			const photo = await cameraRef.current.takePictureAsync({
				base64: true,
				imageType: 'jpg',
				quality: 0.7,
				skipProcessing: false,
			});
			if (photo?.base64) {
				setPhotoAndBind(photo.base64);
				setCameraVisible(false);
			}
		} catch (e) {
			console.log('takePhoto error:', e?.message);
			setPhotoError(strings?.photoLoadError || 'Failed to load photo');
		}
	}, [setPhotoAndBind, strings?.photoLoadError]);

	const getDeviceCoordinates = useCallback(async () => {
		try {
			const perm = await Location.requestForegroundPermissionsAsync();
			if (!perm?.granted) {
				return { lat: null, long: null };
			}
			try {
				const pos = await Location.getCurrentPositionAsync({
					accuracy: Location.Accuracy.Balanced,
				});
				if (pos?.coords?.latitude != null) {
					return { lat: pos.coords.latitude, long: pos.coords.longitude };
				}
			} catch (_) {
				// getCurrentPositionAsync failed (services off, timeout, etc.) — try last known
			}
			try {
				const last = await Location.getLastKnownPositionAsync();
				if (last?.coords?.latitude != null) {
					return { lat: last.coords.latitude, long: last.coords.longitude };
				}
			} catch (_) {
				// no last known position either
			}
		} catch (_) {
			// permission request failed
		}
		return { lat: null, long: null };
	}, []);

	const tryConvertToJpegBase64 = useCallback(async (base64) => {
		if (!base64) return '';
		try {
			const base64Encoding = FileSystem?.EncodingType?.Base64 ?? FileSystem?.EncodingType?.base64 ?? 'base64';
			// If already JPEG (magic bytes /9j/), skip conversion.
			if (String(base64).startsWith('/9j/')) return String(base64);
			const ext = String(base64).startsWith('iVBOR') ? 'png' : 'jpg';
			const inputUri = `${FileSystem.cacheDirectory}nota_constatare_input.${ext}`;
			await FileSystem.writeAsStringAsync(inputUri, String(base64), {
				encoding: base64Encoding,
			});
			const result = await manipulateAsync(
				inputUri,
				[],
				{ base64: true, format: SaveFormat.JPEG, compress: 0.9 }
			);
			return result?.base64 ? String(result.base64) : String(base64);
		} catch (e) {
			console.log('JPEG conversion failed:', e?.message);
			return String(base64);
		}
	}, []);

	const makeBlackWhiteJpegBase64 = useCallback(async (base64) => {
		if (!base64) return '';
		try {
			const base64Encoding = FileSystem?.EncodingType?.Base64 ?? FileSystem?.EncodingType?.base64 ?? 'base64';
			const maxWidth = 768;
			const jpegQuality = 65;

			// Downscale + normalize to JPEG first (faster + smaller payload for print).
			const ext = String(base64).startsWith('iVBOR') ? 'png' : 'jpg';
			const inputUri = `${FileSystem.cacheDirectory}nota_constatare_print_input.${ext}`;
			await FileSystem.writeAsStringAsync(inputUri, String(base64), {
				encoding: base64Encoding,
			});

			const normalized = await manipulateAsync(
				inputUri,
				[{ resize: { width: maxWidth } }],
				{ base64: true, format: SaveFormat.JPEG, compress: 0.75 }
			);
			const jpegBase64 = normalized?.base64
				? String(normalized.base64)
				: await tryConvertToJpegBase64(base64);

			const jpegBuffer = Buffer.from(String(jpegBase64), 'base64');
			const decoded = jpeg.decode(jpegBuffer, { useTArray: true, formatAsRGBA: true });
			if (!decoded?.data || !decoded?.width || !decoded?.height) return String(jpegBase64);
			const { data, width, height } = decoded;

			// Compute luminance buffer.
			const pixelCount = width * height;
			const lum = new Float32Array(pixelCount);
			for (let p = 0, i = 0; p < pixelCount; p += 1, i += 4) {
				const r = data[i];
				const g = data[i + 1];
				const b = data[i + 2];
				// ITU-R BT.601
				lum[p] = 0.299 * r + 0.587 * g + 0.114 * b;
			}

			// Make the output as LIGHT as possible while keeping details.
			// Step 1: contrast-stretch using 5th..95th percentile.
			// Step 2: gamma brighten.
			const hist0 = new Uint32Array(256);
			for (let p = 0; p < pixelCount; p += 1) {
				const v = Math.max(0, Math.min(255, Math.round(lum[p])));
				hist0[v] += 1;
			}
			const targetLow = Math.floor(pixelCount * 0.05);
			const targetHigh = Math.floor(pixelCount * 0.95);
			let acc = 0;
			let p5 = 0;
			for (let i = 0; i < 256; i += 1) {
				acc += hist0[i];
				if (acc >= targetLow) {
					p5 = i;
					break;
				}
			}
			acc = 0;
			let p95 = 255;
			for (let i = 0; i < 256; i += 1) {
				acc += hist0[i];
				if (acc >= targetHigh) {
					p95 = i;
					break;
				}
			}
			const span = Math.max(1, p95 - p5);
			const doStretch = span >= 24;
			const gamma = 0.62; // < 1 => brighter (more aggressive for thermal print)
			for (let i = 0; i < lum.length; i += 1) {
				let v = lum[i];
				if (doStretch) v = ((v - p5) * 255) / span;
				v = Math.max(0, Math.min(255, v));
				const n = v / 255;
				lum[i] = 255 * Math.pow(n, gamma);
			}

			// Otsu threshold for auto black/white.
			const hist = new Uint32Array(256);
			for (let p = 0; p < pixelCount; p += 1) {
				const v = Math.max(0, Math.min(255, Math.round(lum[p])));
				hist[v] += 1;
			}
			let sum = 0;
			for (let t = 0; t < 256; t += 1) sum += t * hist[t];
			let sumB = 0;
			let wB = 0;
			let wF = 0;
			let varMax = -1;
			let threshold = 160;
			for (let t = 0; t < 256; t += 1) {
				wB += hist[t];
				if (wB === 0) continue;
				wF = pixelCount - wB;
				if (wF === 0) break;
				sumB += t * hist[t];
				const mB = sumB / wB;
				const mF = (sum - sumB) / wF;
				const between = wB * wF * (mB - mF) * (mB - mF);
				if (between > varMax) {
					varMax = between;
					threshold = t;
				}
			}
			// Clamp to avoid extreme thresholds on weird frames.
			threshold = Math.max(25, Math.min(210, threshold));
			// Intentionally lighter for thermal print (lower threshold => fewer black pixels).
			threshold = Math.max(10, Math.min(210, threshold - 110));

			// Floyd–Steinberg dithering (still pure black/white output).
			for (let y = 0; y < height; y += 1) {
				for (let x = 0; x < width; x += 1) {
					const idx = y * width + x;
					const oldVal = lum[idx];
					const newVal = oldVal < threshold ? 0 : 255;
					const err = oldVal - newVal;
					lum[idx] = newVal;

					if (x + 1 < width) lum[idx + 1] += (err * 7) / 16;
					if (y + 1 < height) {
						if (x > 0) lum[idx + width - 1] += (err * 3) / 16;
						lum[idx + width] += (err * 5) / 16;
						if (x + 1 < width) lum[idx + width + 1] += err / 16;
					}
				}
			}

			// Write back as B/W RGB.
			for (let p = 0, i = 0; p < pixelCount; p += 1, i += 4) {
				const v = lum[p] < 128 ? 0 : 255;
				data[i] = v;
				data[i + 1] = v;
				data[i + 2] = v;
				data[i + 3] = 255;
			}

			const encoded = jpeg.encode({ data, width, height }, jpegQuality);
			return encoded?.data ? Buffer.from(encoded.data).toString('base64') : String(jpegBase64);
		} catch (e) {
			console.log('B/W conversion failed:', e?.message);
			// Fallback to grayscale (previous behavior) if something goes wrong.
			const jpegBase64 = await tryConvertToJpegBase64(base64);
			try {
				const jpegBuffer = Buffer.from(String(jpegBase64), 'base64');
				const decoded = jpeg.decode(jpegBuffer, { useTArray: true, formatAsRGBA: true });
				if (!decoded?.data || !decoded?.width || !decoded?.height) return String(jpegBase64);
				const data = decoded.data;
				for (let i = 0; i < data.length; i += 4) {
					const r = data[i];
					const g = data[i + 1];
					const b = data[i + 2];
					const y = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
					data[i] = y;
					data[i + 1] = y;
					data[i + 2] = y;
				}
				const encoded = jpeg.encode({ data, width: decoded.width, height: decoded.height }, 70);
				return encoded?.data ? Buffer.from(encoded.data).toString('base64') : String(jpegBase64);
			} catch {
				return String(jpegBase64);
			}
		}
	}, [tryConvertToJpegBase64]);

	// Re-process current photo (preview + payload stay identical)
	useEffect(() => {
		if (!photoSourceBase64) return;
		let cancelled = false;
		setPhotoLoading(true);
		setPhotoError('');
		(async () => {
			try {
				const bw = await makeBlackWhiteJpegBase64(photoSourceBase64);
				if (cancelled) return;
				setPhotoBase64(bw || null);
				setFormValues((prev) => ({
					...prev,
					POZA_MASINA_BASE64: bw ? String(bw) : '',
				}));
			} catch (e) {
				console.log('B/W reprocess error:', e?.message);
				if (cancelled) return;
				setPhotoError(strings?.photoLoadError || 'Failed to process photo');
				setPhotoBase64(String(photoSourceBase64));
				setFormValues((prev) => ({
					...prev,
					POZA_MASINA_BASE64: String(photoSourceBase64),
				}));
			} finally {
				if (!cancelled) setPhotoLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [photoSourceBase64, makeBlackWhiteJpegBase64, strings?.photoLoadError]);

	const buildPayloadInTemplateOrder = useCallback((lat, long, photoBwBase64, plateID) => {
		const pairs = [];

		// Requirements first (to align with backend's iterator-based replacement)
		requirements.forEach((req) => {
			const key = req?.value;
			if (!key) return;
			let raw = formValues?.[key];
			const reqType = String(req?.type || '').toUpperCase();

			if (reqType === 'TIMESTAMP') {
				if (raw instanceof Date) raw = Math.floor(raw.getTime() / 1000);
				else if (typeof raw === 'number') raw = raw < 1e12 ? Math.floor(raw) : Math.floor(raw / 1000);
			}
			if (reqType === 'ISO_STRING') {
				if (raw instanceof Date) raw = raw.toISOString();
			}
			if (reqType === 'INT') {
				if (raw === '' || raw === null || raw === undefined) raw = '';
				else {
					const n = parseInt(String(raw), 10);
					raw = Number.isFinite(n) ? n : String(raw);
					// For days_to_due: append unit and convert to hours when <= 1
					if (key === 'days_to_due') {
						raw = formatDaysToDueValue(raw);
					}
				}
			}
			if (reqType === 'FLOAT') {
				if (raw === '' || raw === null || raw === undefined) raw = '';
				else {
					const n = parseFloat(String(raw));
					raw = Number.isFinite(n) ? n : String(raw);
				}
			}
			if (reqType === 'BOOLEAN') {
				raw = Boolean(raw);
			}

			if (reqType === 'STRING' && key === 'days_to_due') {
				raw = formatDaysToDueValue(raw);
			}

			if (reqType === 'STRING' && !STRING_MASK_EXCLUDED_KEYS.has(key)) {
				const rawText = typeof raw === 'string' ? raw.trim() : '';
				if (!rawText) {
					raw = DEFAULT_STRING_MASK;
				}
			}

			pairs.push([String(key), raw ?? '']);
		});

		const upsertPreserveOrder = (key, value) => {
			const idx = pairs.findIndex(([k]) => k === key);
			if (idx >= 0) pairs[idx] = [key, value];
			else pairs.push([key, value]);
		};

		upsertPreserveOrder('code', selectedViolation?.code ?? '');
		upsertPreserveOrder('lat', lat ?? '');
		upsertPreserveOrder('long', long ?? '');
		upsertPreserveOrder('POZA_MASINA_BASE64', photoBwBase64 ?? '');
		upsertPreserveOrder('preview', false);
		if (plateID !== undefined && plateID !== null && String(plateID) !== '') {
			upsertPreserveOrder('plateID', plateID);
		}

		return Object.fromEntries(pairs);
	}, [formValues, requirements, selectedViolation?.code, formatDaysToDueValue, DEFAULT_STRING_MASK, STRING_MASK_EXCLUDED_KEYS]);

	const handleContinue = useCallback(async () => {
		if (!selectedViolation?.id) return;
		if (submitting) return;
		if (requiresPhoto && photoLoading) {
			Alert.alert(strings?.error || 'Error', strings?.processingPhoto || 'Photo is still being processed for print. Please wait a second.');
			return;
		}
		if (requiresPhoto && !photoBase64) {
			Alert.alert(strings?.error || 'Error', strings?.addPhoto || 'Add photo');
			return;
		}

		try {
			setSubmitting(true);

			const { lat, long } = await getDeviceCoordinates();
			const bwPhoto = photoBase64 ? String(photoBase64) : '';

			const source = params?.source || params?.from || params?.origin;
			const isFromLpr = String(source || '').toLowerCase() === 'lpr';
			const plateIdRaw =
				params?.lpr_id ??
				params?.lprId ??
				params?.scan_id ??
				params?.scanId ??
				params?.detection_id ??
				params?.detectionId;
			const plateID = (() => {
				if (!isFromLpr) return undefined;
				if (plateIdRaw === null || plateIdRaw === undefined) return undefined;
				const s = String(plateIdRaw).trim();
				if (!s) return undefined;
				if (/^-?\d+$/.test(s)) return parseInt(s, 10);
				return s;
			})();

			const payload = buildPayloadInTemplateOrder(lat, long, bwPhoto, plateID);
			const res = await notaConstatareInstance(authRef.current)
				.post(`/${selectedViolation.id}/generate_fine`, payload);

			if (res?.data?.printed_nota) {
				setPrintPreview({
					printed_id: res?.data?.printed_id,
					printed_nota: String(res?.data?.printed_nota),
					violation_id: selectedViolation.id,
					dots_printer: res?.data?.dots_printer ?? null,
				});
				router.push('/print-preview');
			}
		} catch (e) {
			console.log('generate_fine error:', e?.message);
			Alert.alert(strings?.error || 'Error', e?.message || (strings?.loadError || 'Failed to load data'));
		} finally {
			setSubmitting(false);
		}
	}, [selectedViolation?.id, submitting, requiresPhoto, photoLoading, photoBase64, strings?.error, strings?.addPhoto, getDeviceCoordinates, buildPayloadInTemplateOrder, strings?.loadError, params]);

	// Handle form value changes
	const handleValueChange = (key, value) => {
		setFormValues((prev) => {
			const next = {
				...prev,
				[key]: stripDiacritics(value),
			};

			const hasAmenda = requirements.some((req) => req?.type === 'BOOLEAN' && req?.value === 'AMENDA');
			const hasAvertisment = requirements.some((req) => req?.type === 'BOOLEAN' && req?.value === 'AVERTISMENT');

			if (hasAmenda && hasAvertisment) {
				if (key === 'AMENDA') next.AVERTISMENT = !Boolean(value);
				if (key === 'AVERTISMENT') next.AMENDA = !Boolean(value);
			}

			if ((key === 'AMENDA' && !Boolean(value)) || (key === 'AVERTISMENT' && Boolean(value))) {
				next.PUNCTE_AMENDA = 0;
			}

			return next;
		});
	};

	const handleGroupedValueChange = (keys, value) => {
		setFormValues((prev) => {
			const next = { ...prev };
			keys.forEach((groupKey) => {
				next[groupKey] = value;
			});
			return next;
		});
	};

	const displayRequirements = useMemo(() => {
		const normalizeSuffixLabel = (suffix) =>
			suffix
				.split('_')
				.filter(Boolean)
				.map((part) => part.charAt(0) + part.slice(1).toLowerCase())
				.join(' ');

		const timestampGroupMap = new Map();
		requirements.forEach((req) => {
			if (req.type !== 'TIMESTAMP' && req.type !== 'ISO_STRING') return;
			const rawKey = String(req.value || '');
			const splitIndex = rawKey.indexOf('_');
			if (splitIndex < 0 || splitIndex === rawKey.length - 1) return;
			const suffix = rawKey.slice(splitIndex + 1);
			if (!timestampGroupMap.has(suffix)) {
				timestampGroupMap.set(suffix, []);
			}
			timestampGroupMap.get(suffix).push(req);
		});

		const consumedKeys = new Set();
		const result = [];

		requirements.forEach((req) => {
			const rawKey = String(req.value || '');
			if (consumedKeys.has(rawKey)) return;

			if (req.type === 'TIMESTAMP' || req.type === 'ISO_STRING') {
				const splitIndex = rawKey.indexOf('_');
				if (splitIndex >= 0 && splitIndex < rawKey.length - 1) {
					const suffix = rawKey.slice(splitIndex + 1);
					const group = timestampGroupMap.get(suffix) || [];
					if (group.length > 1) {
						group.forEach((item) => consumedKeys.add(String(item.value || '')));
						result.push({
							...group[0],
							value: `__GROUP__${suffix}`,
							label: `Data ${normalizeSuffixLabel(suffix)}`,
							groupKeys: group.map((item) => String(item.value || '')),
						});
						return;
					}
				}
			}

			consumedKeys.add(rawKey);
			result.push(req);
		});

		return result;
	}, [requirements]);

	const booleanKeys = useMemo(() => {
		return requirements
			.filter((req) => req?.type === 'BOOLEAN' && req?.value)
			.map((req) => String(req.value))
			.sort((a, b) => b.length - a.length);
	}, [requirements]);

	const getControllingBooleanKey = useCallback((fieldKey) => {
		if (!fieldKey) return null;
		const key = String(fieldKey);

		for (const booleanKey of booleanKeys) {
			if (key === booleanKey) continue;

			if (key.endsWith(`_${booleanKey}`)) return booleanKey;
			if (key.startsWith(`DESC_${booleanKey}`)) return booleanKey;
			if (key.startsWith(`${booleanKey}_`)) return booleanKey;
			if (key.includes(`_${booleanKey}_`)) return booleanKey;
		}

		return null;
	}, [booleanKeys]);

	const isFieldVisibleByBooleanRules = useCallback((fieldKey) => {
		const controllerKey = getControllingBooleanKey(fieldKey);
		if (!controllerKey) return true;
		return Boolean(formValues?.[controllerKey]);
	}, [formValues, getControllingBooleanKey]);

	const visibleDisplayRequirements = useMemo(() => {
		return displayRequirements.filter((req) => {
			const groupKeys = Array.isArray(req?.groupKeys) ? req.groupKeys : [];
			if (groupKeys.length > 0) {
				return groupKeys.every((groupKey) => isFieldVisibleByBooleanRules(groupKey));
			}

			const key = String(req?.value || '');
			return isFieldVisibleByBooleanRules(key);
		});
	}, [displayRequirements, isFieldVisibleByBooleanRules]);

	const isPjEnabled = useMemo(() => {
		const hasPjRequirement = requirements.some((req) => req?.type === 'BOOLEAN' && req?.value === 'PJ');
		return hasPjRequirement && Boolean(formValues?.PJ);
	}, [requirements, formValues?.PJ]);

	const hasPuncteAmendaKey = useMemo(
		() => requirements.some((req) => req?.value === 'PUNCTE_AMENDA' && req?.type === 'INT'),
		[requirements]
	);
	const hasAmountKey = useMemo(
		() => requirements.some((req) => req?.value === 'amount'),
		[requirements]
	);
	const isAmountAutoControlled = hasPuncteAmendaKey && hasAmountKey;
	const pjSensitiveRequirementKeys = useMemo(() => {
		const keys = [];

		if (!isAmountAutoControlled && hasAmountKey) keys.push('amount');
		if (requirements.some((req) => req?.value === 'min_fine_amount')) keys.push('min_fine_amount');
		if (requirements.some((req) => req?.value === 'max_fine_amount')) keys.push('max_fine_amount');
		if (requirements.some((req) => req?.value === 'fine_point_amount')) keys.push('fine_point_amount');

		return keys;
	}, [requirements, isAmountAutoControlled, hasAmountKey]);

	const halfMinTargetKey = useMemo(() => {
		if (requirements.some((req) => req?.value === 'half_min_amount')) return 'half_min_amount';
		if (requirements.some((req) => req?.value === 'half_minimum')) return 'half_minimum';
		return null;
	}, [requirements]);
	const hasMinFineAmountKey = useMemo(
		() => requirements.some((req) => req?.value === 'min_fine_amount'),
		[requirements]
	);
	const isHalfMinAutoControlled = Boolean(halfMinTargetKey && hasMinFineAmountKey);

	useEffect(() => {
		if (!selectedViolation?.id) return;
		if (pjSensitiveRequirementKeys.length === 0) return;

		setFormValues((prev) => {
			let changed = false;
			const next = { ...prev };

			pjSensitiveRequirementKeys.forEach((key) => {
				const violationValue = getViolationValueForRequirement(selectedViolation, key, isPjEnabled);
				if (violationValue === null || violationValue === undefined) return;

				if (next[key] !== violationValue) {
					next[key] = violationValue;
					changed = true;
				}
			});

			return changed ? next : prev;
		});
	}, [selectedViolation, pjSensitiveRequirementKeys, isPjEnabled, getViolationValueForRequirement]);

	useEffect(() => {
		if (!isAmountAutoControlled) return;

		setFormValues((prev) => {
			const parseNumber = (raw) => {
				const n = Number(raw);
				return Number.isFinite(n) ? n : 0;
			};

			const finePointAmount = parseNumber(prev?.fine_point_amount);
			const puncteAmenda = parseNumber(prev?.PUNCTE_AMENDA);
			const amendaEnabled = prev?.AMENDA === undefined ? true : Boolean(prev?.AMENDA);

			const computedAmount = amendaEnabled ? finePointAmount * puncteAmenda : 0;
			if (prev?.amount === computedAmount) return prev;

			return {
				...prev,
				amount: computedAmount,
			};
		});
	}, [isAmountAutoControlled, formValues?.fine_point_amount, formValues?.PUNCTE_AMENDA, formValues?.AMENDA]);

	useEffect(() => {
		if (!isHalfMinAutoControlled || !halfMinTargetKey) return;

		setFormValues((prev) => {
			const parseNumber = (raw) => {
				const n = Number(raw);
				return Number.isFinite(n) ? n : 0;
			};

			const minFineAmount = parseNumber(prev?.min_fine_amount);
			const computedHalfMin = minFineAmount / 2;

			if (prev?.[halfMinTargetKey] === computedHalfMin) return prev;

			return {
				...prev,
				[halfMinTargetKey]: computedHalfMin,
			};
		});
	}, [isHalfMinAutoControlled, halfMinTargetKey, formValues?.min_fine_amount]);

	useEffect(() => {
		setFormValues((prev) => {
			let changed = false;
			const next = { ...prev };

			requirements.forEach((req) => {
				const key = req?.value;
				if (!key) return;
				if (req?.type === 'BOOLEAN') return;

				const controllerKey = getControllingBooleanKey(key);
				if (!controllerKey) return;
				if (Boolean(prev?.[controllerKey])) return;

					const clearedValue = key === 'PUNCTE_AMENDA' ? 0 : '';
					if (next[key] !== clearedValue) {
						next[key] = clearedValue;
					changed = true;
				}
			});

			return changed ? next : prev;
		});
	}, [requirements, getControllingBooleanKey, formValues]);

	// Render input based on type
	const renderInput = (requirement) => {
		const { label, value: rawKey, type, groupKeys } = requirement;
		const isGroupedTimestamp = Array.isArray(groupKeys) && groupKeys.length > 1;
		const key = isGroupedTimestamp ? groupKeys[0] : rawKey;
		const isLocked = isGroupedTimestamp
			? groupKeys.every((groupKey) => Boolean(lockedFields?.[groupKey]))
			: Boolean(lockedFields?.[key]);
		const isDaysToDueField = key === 'days_to_due';

		switch (type) {
			case 'STRING':
					const isLicensePlate = key === 'license_plate';
					const isStringReadOnly = isLocked || isDaysToDueField;
				return (
					<View key={key} style={styles.inputContainer}>
						<CustomTextMedium style={styles.inputLabel}>{label}</CustomTextMedium>
						<TextInput
							style={[styles.textInput, isStringReadOnly && styles.textInputLocked]}
							value={formValues[key] || ''}
								onChangeText={(text) => handleValueChange(key, isLicensePlate ? normalizeLicensePlate(text) : text)}
							placeholder={label}
							placeholderTextColor={gray}
							editable={!isStringReadOnly}
							selectTextOnFocus={!isStringReadOnly}
								autoCapitalize={isLicensePlate ? 'characters' : 'sentences'}
								autoCorrect={!isLicensePlate}
						/>
					</View>
				);

			case 'INT':
				// Display helper for days_to_due: show unit + convert to hours when <= 1 (display only)
				const isDaysToDue = key === 'days_to_due';
				let displayIntValue = formValues[key]?.toString() || '';
				let unitText = '';
				if (isDaysToDue) {
					const days = Number(formValues[key]);
					if (Number.isFinite(days)) {
						if (isLocked && days <= 1) {
							displayIntValue = String(Math.round(days * 24));
							unitText = strings?.unitHours || 'hours';
						} else {
							unitText = strings?.unitDays || 'days';
						}
					}
				}
				return (
					<View key={key} style={styles.inputContainer}>
						<CustomTextMedium style={styles.inputLabel}>{label}</CustomTextMedium>
						<View style={styles.inputRow}>
							<TextInput
								style={[styles.textInput, styles.textInputFlex, isLocked && styles.textInputLocked]}
								value={isDaysToDue ? displayIntValue : formValues[key]?.toString() || ''}
								onChangeText={(text) => handleValueChange(key, text.replace(/[^0-9-]/g, ''))}
								placeholder={label}
								placeholderTextColor={gray}
								keyboardType="numeric"
								editable={!isLocked}
								selectTextOnFocus={!isLocked}
							/>
							{isDaysToDue && unitText ? (
								<View style={styles.unitPill}>
									<CustomTextRegular style={styles.unitText}>{unitText}</CustomTextRegular>
								</View>
							) : null}
						</View>
					</View>
				);

			case 'FLOAT':
				const isAmountField = key === 'amount';
				const isAmountReadOnly = isAmountField && isAmountAutoControlled;
				const isHalfMinField = key === 'half_min_amount' || key === 'half_minimum';
				const isHalfMinReadOnly = isHalfMinField && isHalfMinAutoControlled;
				return (
					<View key={key} style={styles.inputContainer}>
						<CustomTextMedium style={styles.inputLabel}>{label}</CustomTextMedium>
						<TextInput
							style={[styles.textInput, (isLocked || isAmountReadOnly || isHalfMinReadOnly) && styles.textInputLocked]}
							value={formValues[key]?.toString() || ''}
							onChangeText={(text) => handleValueChange(key, text.replace(/[^0-9.-]/g, ''))}
							placeholder={label}
							placeholderTextColor={gray}
							keyboardType="decimal-pad"
							editable={!isLocked && !isAmountReadOnly && !isHalfMinReadOnly}
							selectTextOnFocus={!isLocked && !isAmountReadOnly && !isHalfMinReadOnly}
						/>
					</View>
				);

			case 'BOOLEAN':
				return (
					<View key={key} style={styles.inputContainer}>
						<CustomTextMedium style={styles.inputLabel}>{label}</CustomTextMedium>
						<View style={[styles.switchContainer, isLocked && styles.switchContainerLocked]}>
							<CustomTextRegular style={{ ...general.fontSize8, color: formValues[key] ? gray : black }}>
								{strings?.false || 'No'}
							</CustomTextRegular>
							<Switch
								value={formValues[key] || false}
								onValueChange={(val) => handleValueChange(key, val)}
								trackColor={{ false: lightGray, true: purple + '80' }}
								thumbColor={formValues[key] ? purple : gray}
								style={{ marginHorizontal: resize(10) }}
								disabled={isLocked}
							/>
							<CustomTextRegular style={{ ...general.fontSize8, color: formValues[key] ? black : gray }}>
								{strings?.true || 'Yes'}
							</CustomTextRegular>
						</View>
					</View>
				);

			case 'TIMESTAMP':
			case 'ISO_STRING':
				const currentDate = formValues[key] instanceof Date ? formValues[key] : new Date();
				const setTimestampValue = (newDate) => {
					if (isGroupedTimestamp) {
						handleGroupedValueChange(groupKeys, newDate);
						return;
					}
					handleValueChange(key, newDate);
				};
				return (
					<View key={String(rawKey)} style={styles.inputContainer}>
						<CustomTextMedium style={styles.inputLabel}>{label}</CustomTextMedium>
						<View style={styles.dateTimeContainer}>
							<TouchableOpacity
								style={[styles.dateTimeButton, isLocked && styles.dateTimeButtonLocked]}
								onPress={() => {
									if (!isLocked) setShowDatePicker(key);
								}}
								activeOpacity={isLocked ? 1 : 0.7}
							>
								<MaterialIcons name="calendar-today" size={resize(18)} color={purple} />
								<CustomTextRegular style={styles.dateTimeText}>
									{currentDate.toLocaleDateString()}
								</CustomTextRegular>
							</TouchableOpacity>
							<TouchableOpacity
								style={[styles.dateTimeButton, isLocked && styles.dateTimeButtonLocked]}
								onPress={() => {
									if (!isLocked) setShowTimePicker(key);
								}}
								activeOpacity={isLocked ? 1 : 0.7}
							>
								<MaterialIcons name="access-time" size={resize(18)} color={purple} />
								<CustomTextRegular style={styles.dateTimeText}>
									{currentDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
								</CustomTextRegular>
							</TouchableOpacity>
						</View>
						{!isLocked && showDatePicker === key && (
							<DateTimePicker
								value={currentDate}
								mode="date"
								display={Platform.OS === 'ios' ? 'spinner' : 'default'}
								onChange={(event, date) => {
									setShowDatePicker(null);
									if (date) {
										const newDate = new Date(currentDate);
										newDate.setFullYear(date.getFullYear());
										newDate.setMonth(date.getMonth());
										newDate.setDate(date.getDate());
										setTimestampValue(newDate);
									}
								}}
							/>
						)}
						{!isLocked && showTimePicker === key && (
							<DateTimePicker
								value={currentDate}
								mode="time"
								display={Platform.OS === 'ios' ? 'spinner' : 'default'}
								onChange={(event, date) => {
									setShowTimePicker(null);
									if (date) {
										const newDate = new Date(currentDate);
										newDate.setHours(date.getHours());
										newDate.setMinutes(date.getMinutes());
										setTimestampValue(newDate);
									}
								}}
							/>
						)}
					</View>
				);

			default:
				return (
					<View key={key} style={styles.inputContainer}>
						<CustomTextMedium style={styles.inputLabel}>{label}</CustomTextMedium>
						<TextInput
							style={[styles.textInput, isLocked && styles.textInputLocked]}
							value={formValues[key] || ''}
							onChangeText={(text) => handleValueChange(key, text)}
							placeholder={label}
							placeholderTextColor={gray}
							editable={!isLocked}
							selectTextOnFocus={!isLocked}
						/>
					</View>
				);
		}
	};

	// Loading state
	if (loadingCodes) {
		return (
			<View style={styles.centerContainer}>
				<ActivityIndicator size="large" color={purple} />
				<CustomTextMedium style={styles.loadingText}>
					{strings?.loading || 'Loading...'}
				</CustomTextMedium>
			</View>
		);
	}

	// Error state
	if (errorCodes) {
		return (
			<View style={styles.centerContainer}>
				<MaterialIcons name="error-outline" size={resize(60)} color={purple} />
				<CustomTextMedium style={styles.errorText}>{errorCodes}</CustomTextMedium>
				<TouchableOpacity style={styles.retryButton} onPress={fetchViolationCodes}>
					<CustomTextMedium style={styles.retryButtonText}>
						{strings?.retry || 'Retry'}
					</CustomTextMedium>
				</TouchableOpacity>
			</View>
		);
	}

	return (
		<ScrollView 
			style={styles.container}
			contentContainerStyle={styles.contentContainer}
			keyboardShouldPersistTaps="handled"
		>
			<Stack.Screen
				options={{
					title: strings.title,
					headerStyle: { backgroundColor: lightOrange },
					headerTintColor: purple,
					statusBarColor: lightOrange,
					statusBarStyle: 'dark',
				}}
			/>
			{/* Camera Modal */}
			<Modal
				visible={cameraVisible}
				animationType="slide"
				onRequestClose={() => setCameraVisible(false)}
			>
				<View style={styles.cameraContainer}>
					<CameraView style={styles.camera} ref={cameraRef} facing="back" />

					{/* Top overlay – close button */}
					<View style={styles.cameraTopBar}>
						<View style={styles.cameraTopBarLeft}>
							<MaterialCommunityIcons name="car-info" size={resize(20)} color={white} />
							<CustomTextMedium style={styles.cameraTopHint}>
								{strings?.photoHint || 'Frame the vehicle and the plate clearly.'}
							</CustomTextMedium>
						</View>
						<TouchableOpacity onPress={() => setCameraVisible(false)} style={styles.cameraTopButton}>
							<MaterialIcons name="close" size={resize(26)} color={white} />
						</TouchableOpacity>
					</View>

					{/* Viewfinder frame */}
					<View style={styles.viewfinderWrap} pointerEvents="none">
						<View style={[styles.corner, styles.cornerTL]} />
						<View style={[styles.corner, styles.cornerTR]} />
						<View style={[styles.corner, styles.cornerBL]} />
						<View style={[styles.corner, styles.cornerBR]} />
					</View>

					{/* Bottom controls */}
					<View style={styles.cameraControls}>
						<TouchableOpacity onPress={takePhotoNow} style={styles.shutterButton} activeOpacity={0.75}>
							<View style={styles.shutterInner} />
						</TouchableOpacity>
					</View>
				</View>
			</Modal>

			{/* Hero Card */}
			<View style={styles.heroCard}>
				<View style={styles.heroDecorPrimary} />
				<View style={styles.heroDecorSecondary} />
				<View style={styles.heroBadge}>
					<MaterialIcons name="description" size={resize(16)} color={white} />
					<CustomTextMedium style={styles.heroBadgeText}>{strings?.title || 'Nota de Constatare'}</CustomTextMedium>
				</View>
				<CustomTextBold style={styles.heroTitle}>{strings?.title || 'Nota de Constatare'}</CustomTextBold>
				<CustomTextRegular style={styles.heroSubtitle}>{strings?.selectViolationType || 'Select a violation type to continue'}</CustomTextRegular>
			</View>

			{/* Violation Type Selector */}
			<View style={styles.section}>
				<CustomTextBold style={styles.sectionTitle}>
					{strings?.selectViolationType || 'Select Violation Type'}
				</CustomTextBold>

				{/* Dropdown Trigger */}
				<TouchableOpacity
					style={styles.dropdownTrigger}
					onPress={() => {
						if (!violationTypeLocked) setShowDropdown(!showDropdown);
					}}
					activeOpacity={0.7}
				>
					<View style={styles.dropdownTriggerContent}>
						{selectedViolation ? (
							<View style={styles.selectedItemDisplay}>
								<CustomTextMedium style={styles.selectedItemName} numberOfLines={2}>
									{selectedViolation.name}
								</CustomTextMedium>
								<CustomTextRegular style={styles.selectedItemDescription} numberOfLines={1}>
									{selectedViolation.description}
								</CustomTextRegular>
							</View>
						) : (
							<CustomTextRegular style={styles.placeholderText}>
								{strings?.select || 'Select...'}
							</CustomTextRegular>
						)}
					</View>
					{violationTypeLocked ? (
						<MaterialIcons name="lock" size={resize(20)} color={gray} />
					) : (
						<MaterialIcons
							name={showDropdown ? 'expand-less' : 'expand-more'}
							size={resize(24)}
							color={purple}
						/>
					)}
				</TouchableOpacity>

				{/* Dropdown Options */}
				{showDropdown && !violationTypeLocked && (
					<View style={styles.dropdownOptions}>
						{violationCodes.length === 0 ? (
							<View style={styles.noDataContainer}>
								<CustomTextRegular style={styles.noDataText}>
									{strings?.noViolationCodes || 'No violation codes available'}
								</CustomTextRegular>
							</View>
						) : (
							violationCodes.map((code) => (
								<TouchableOpacity
									key={code.id}
									style={[
										styles.dropdownOption,
										selectedViolation?.id === code.id && styles.dropdownOptionSelected,
									]}
									onPress={() => {
										setSelectedViolation(code);
										setShowDropdown(false);
									}}
								>
									<View style={styles.optionContent}>
										<CustomTextMedium style={styles.optionName}>
											{code.name}
										</CustomTextMedium>
										<CustomTextRegular style={styles.optionDescription} numberOfLines={2}>
											{code.description}
										</CustomTextRegular>
										<View style={styles.optionMeta}>
											<View style={styles.optionMetaItem}>
												<MaterialIcons name="euro" size={resize(12)} color={orange} />
												<CustomTextRegular style={styles.optionMetaText}>
														{getViolationValueForRequirement(code, 'amount', isPjEnabled)} RON
												</CustomTextRegular>
											</View>
											<View style={styles.optionMetaItem}>
												<MaterialIcons name="schedule" size={resize(12)} color={gray} />
												<CustomTextRegular style={styles.optionMetaText}>
													{code.days_to_due} {strings?.unitDays || 'days'}
												</CustomTextRegular>
											</View>
										</View>
									</View>
									{selectedViolation?.id === code.id && (
										<MaterialIcons name="check-circle" size={resize(22)} color={purple} />
									)}
								</TouchableOpacity>
							))
						)}
					</View>
				)}

				{/* Violation Code Display (read-only) */}
				{selectedViolation && (
					<View style={styles.codeDisplayContainer}>
						<CustomTextMedium style={styles.codeDisplayLabel}>
							{strings?.violationCode || 'Violation Code'}
						</CustomTextMedium>
						<View style={styles.codeDisplayBox}>
							<MaterialIcons name="gavel" size={resize(20)} color={purple} />
							<CustomTextBold style={styles.codeDisplayText}>
								{selectedViolation.code}
							</CustomTextBold>
						</View>
					</View>
				)}
			</View>

			{/* Requirements Section */}
			{selectedViolation && (
				<>
					{/* Photo Section (when required) */}
					{requiresPhoto ? (
						<View style={styles.photoSection}>
							{/* Section label row */}
							<View style={styles.photoLabelRow}>
								<View style={styles.photoLabelBadge}>
									<MaterialCommunityIcons name="camera" size={resize(14)} color={white} />
								</View>
								<CustomTextBold style={styles.photoLabel}>
									{strings?.photo || 'Photo'}
								</CustomTextBold>
							</View>

							{/* Hint card */}
							<View style={styles.photoHintCard}>
								<MaterialCommunityIcons name="information-outline" size={resize(18)} color={purple} style={{ marginTop: resize(1) }} />
								<CustomTextRegular style={styles.photoHintText}>
									{strings?.photoHint || 'Make sure the vehicle and the license plate are clearly visible in the frame.'}
								</CustomTextRegular>
							</View>

							{/* Loading state */}
							{photoLoading ? (
								<View style={styles.photoLoadingCard}>
									<ActivityIndicator size="small" color={purple} />
									<CustomTextRegular style={styles.photoLoadingText}>
										{strings?.photoLoading || 'Loading photo...'}
									</CustomTextRegular>
								</View>
							) : null}

							{/* Error state */}
							{photoError && !photoLoading ? (
								<View style={styles.photoErrorCard}>
									<MaterialIcons name="error-outline" size={resize(18)} color={orange} />
									<CustomTextRegular style={styles.photoErrorText}>
										{photoError}
									</CustomTextRegular>
								</View>
							) : null}

							{/* Photo card */}
							{!photoLoading && (
								photoBase64 ? (
									<View>
										<View style={styles.photoCard}>
											<Image
												source={{ uri: `data:image/jpeg;base64,${photoBase64}` }}
												style={styles.photoPreview}
												resizeMode="cover"
											/>
											{/* Check badge */}
											<View style={styles.photoCheckBadge}>
												<MaterialIcons name="check-circle" size={resize(22)} color={white} />
											</View>
										</View>
										{/* Action buttons below photo */}
										<View style={styles.photoActionsRow}>
											<TouchableOpacity style={styles.photoActionButton} onPress={openCamera} activeOpacity={0.85}>
												<MaterialCommunityIcons name="camera-retake" size={resize(17)} color={white} />
												<CustomTextMedium style={styles.photoActionText}>
													{strings?.changePhoto || 'Change'}
												</CustomTextMedium>
											</TouchableOpacity>
											<TouchableOpacity style={styles.photoRemoveButton} onPress={() => setPhotoAndBind(null)} activeOpacity={0.85}>
												<MaterialIcons name="delete-outline" size={resize(17)} color={orange} />
												<CustomTextMedium style={styles.photoRemoveText}>
													{strings?.removePhoto || 'Remove'}
												</CustomTextMedium>
											</TouchableOpacity>
										</View>
									</View>
								) : (
									<TouchableOpacity style={styles.photoEmptyCard} onPress={openCamera} activeOpacity={0.8}>
										<View style={styles.photoEmptyIconWrap}>
											<MaterialCommunityIcons name="camera-plus" size={resize(38)} color={purple} />
										</View>
										<CustomTextBold style={styles.photoEmptyTitle}>
											{strings?.addPhoto || 'Add photo'}
										</CustomTextBold>
										<CustomTextRegular style={styles.photoEmptySubtitle}>
											{strings?.takePhoto || 'Take photo now'}
										</CustomTextRegular>
									</TouchableOpacity>
								)
							)}
						</View>
					) : null}

				<View style={styles.section}>
					<CustomTextBold style={styles.sectionTitle}>
						{strings?.requirements || 'Required Information'}
					</CustomTextBold>

					{loadingRequirements ? (
						<View style={styles.loadingRequirements}>
							<ActivityIndicator size="small" color={purple} />
							<CustomTextRegular style={styles.loadingRequirementsText}>
								{strings?.loading || 'Loading...'}
							</CustomTextRegular>
						</View>
					) : errorRequirements ? (
						<View style={styles.errorRequirements}>
							<MaterialIcons name="error-outline" size={resize(24)} color={orange} />
							<CustomTextRegular style={styles.errorRequirementsText}>
								{errorRequirements}
							</CustomTextRegular>
						</View>
					) : requirements.length === 0 ? (
						<View style={styles.noRequirements}>
							<MaterialIcons name="check-circle-outline" size={resize(24)} color={purple} />
							<CustomTextRegular style={styles.noRequirementsText}>
								{strings?.noRequirements || 'No additional requirements'}
							</CustomTextRegular>
						</View>
					) : (
						<View style={styles.requirementsForm}>
							{visibleDisplayRequirements.map((req) => renderInput(req))}
						</View>
					)}
				</View>
				</>
			)}

			{/* Placeholder when nothing is selected */}
			{!selectedViolation && (
				<View style={styles.placeholderContainer}>
					<MaterialIcons name="touch-app" size={resize(48)} color={lightGray} />
					<CustomTextRegular style={styles.placeholderInfoText}>
						{strings?.selectFirst || 'Please select a violation type first'}
					</CustomTextRegular>
				</View>
			)}

			{/* Continue button (bottom) */}
			{selectedViolation ? (
				<View style={styles.continueWrap}>
					<TouchableOpacity
						style={[styles.continueButton, (submitting || (requiresPhoto && photoLoading)) && styles.continueButtonDisabled]}
						onPress={handleContinue}
						activeOpacity={0.85}
						disabled={submitting || (requiresPhoto && photoLoading)}
					>
						{submitting ? (
							<ActivityIndicator size="small" color={white} />
						) : (
							<>
								<MaterialIcons name="arrow-forward" size={resize(20)} color={white} />
								<CustomTextBold style={styles.continueText}>
									{strings?.continue || 'Continua'}
								</CustomTextBold>
							</>
						)}
					</TouchableOpacity>
				</View>
			) : null}
		</ScrollView>
	);
};

const styles = {
	container: {
		flex: 1,
		backgroundColor: lightOrange,
	},
	contentContainer: {
		paddingBottom: resize(40),
	},
	continueWrap: {
		paddingHorizontal: resize(16),
		paddingTop: resize(4),
		paddingBottom: resize(32),
	},
	continueButton: {
		backgroundColor: purple,
		borderRadius: resize(14),
		paddingVertical: resize(14),
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: resize(10),
	},
	continueButtonDisabled: {
		opacity: 0.6,
	},
	continueText: {
		...general.fontSize10,
		color: white,
	},
	centerContainer: {
		flex: 1,
		justifyContent: 'center',
		alignItems: 'center',
		backgroundColor: lightOrange,
		padding: resize(20),
	},
	heroCard: {
		backgroundColor: purple,
		borderRadius: resize(24),
		margin: resize(16),
		marginBottom: resize(10),
		padding: resize(20),
		overflow: 'hidden',
		...general.shaddowLight,
	},
	heroDecorPrimary: {
		position: 'absolute',
		width: resize(160),
		height: resize(160),
		borderRadius: resize(80),
		backgroundColor: 'rgba(255,255,255,0.08)',
		top: resize(-40),
		right: resize(-30),
	},
	heroDecorSecondary: {
		position: 'absolute',
		width: resize(110),
		height: resize(110),
		borderRadius: resize(55),
		backgroundColor: 'rgba(243,135,19,0.22)',
		bottom: resize(-30),
		left: resize(-20),
	},
	heroBadge: {
		flexDirection: 'row',
		alignItems: 'center',
		alignSelf: 'flex-start',
		gap: resize(6),
		backgroundColor: 'rgba(255,255,255,0.15)',
		paddingHorizontal: resize(10),
		paddingVertical: resize(6),
		borderRadius: resize(999),
		marginBottom: resize(14),
	},
	heroBadgeText: {
		...general.fontSize6,
		color: white,
	},
	heroTitle: {
		...general.fontSize14,
		color: white,
		marginBottom: resize(6),
	},
	heroSubtitle: {
		...general.fontSize6,
		color: 'rgba(255,255,255,0.80)',
		lineHeight: resize(18),
	},
	section: {
		marginHorizontal: resize(16),
		marginBottom: resize(12),
		padding: resize(16),
		paddingTop: resize(18),
		backgroundColor: white,
		borderRadius: resize(18),
		...general.shaddowLighter,
	},
	sectionTitle: {
		...general.fontSize8,
		color: gray,
		textTransform: 'uppercase',
		letterSpacing: 1.1,
		marginBottom: resize(12),
	},
	dropdownTrigger: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		backgroundColor: lightOrange,
		borderRadius: resize(12),
		borderWidth: 1,
		borderColor: lightGray,
		padding: resize(14),
		minHeight: resize(60),
	},
	dropdownTriggerContent: {
		flex: 1,
		marginRight: resize(10),
	},
	selectedItemDisplay: {
		flex: 1,
	},
	selectedItemName: {
		...general.fontSize10,
		color: black,
		lineHeight: resize(22),
	},
	selectedItemDescription: {
		...general.fontSize6,
		color: gray,
		marginTop: resize(2),
	},
	placeholderText: {
		...general.fontSize10,
		color: gray,
	},
	dropdownOptions: {
		marginTop: resize(8),
		backgroundColor: white,
		borderRadius: resize(12),
		borderWidth: 1,
		borderColor: lightGray,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.1,
		shadowRadius: 8,
		elevation: 5,
		overflow: 'hidden',
	},
	dropdownOption: {
		flexDirection: 'row',
		alignItems: 'center',
		padding: resize(14),
		borderBottomWidth: 1,
		borderBottomColor: lighterMoreGray,
	},
	dropdownOptionSelected: {
		backgroundColor: lightOrange,
	},
	optionContent: {
		flex: 1,
	},
	optionName: {
		...general.fontSize10,
		color: black,
	},
	optionDescription: {
		...general.fontSize6,
		color: gray,
		marginTop: resize(4),
	},
	optionMeta: {
		flexDirection: 'row',
		marginTop: resize(8),
	},
	optionMetaItem: {
		flexDirection: 'row',
		alignItems: 'center',
		marginRight: resize(16),
	},
	optionMetaText: {
		...general.fontSize6,
		color: gray,
		marginLeft: resize(4),
	},
	noDataContainer: {
		padding: resize(20),
		alignItems: 'center',
	},
	noDataText: {
		...general.fontSize8,
		color: gray,
	},
	codeDisplayContainer: {
		marginTop: resize(16),
	},
	codeDisplayLabel: {
		...general.fontSize8,
		color: gray,
		marginBottom: resize(8),
	},
	codeDisplayBox: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: lightOrange,
		borderRadius: resize(10),
		borderWidth: 1,
		borderColor: purple + '30',
		borderStyle: 'dashed',
		padding: resize(14),
	},
	codeDisplayText: {
		...general.fontSize10,
		color: purple,
		marginLeft: resize(10),
	},
	loadingRequirements: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		padding: resize(20),
	},
	loadingRequirementsText: {
		...general.fontSize8,
		color: gray,
		marginLeft: resize(10),
	},
	errorRequirements: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		padding: resize(20),
		backgroundColor: orange + '10',
		borderRadius: resize(10),
	},
	errorRequirementsText: {
		...general.fontSize8,
		color: orange,
		marginLeft: resize(10),
	},
	noRequirements: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		padding: resize(20),
		backgroundColor: purple + '10',
		borderRadius: resize(10),
	},
	noRequirementsText: {
		...general.fontSize8,
		color: purple,
		marginLeft: resize(10),
	},
	requirementsForm: {
		borderRadius: resize(12),
	},
	inputContainer: {
		marginBottom: resize(16),
	},
	inputLabel: {
		...general.fontSize8,
		color: black,
		marginBottom: resize(8),
	},
	textInput: {
		backgroundColor: white,
		borderRadius: resize(10),
		borderWidth: 1,
		borderColor: lightGray,
		padding: resize(12),
		...general.fontSize10,
		color: black,
		fontFamily: 'Poppins_400Regular',
	},
	textInputFlex: {
		flex: 1,
	},
	inputRow: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	unitPill: {
		marginLeft: resize(8),
		paddingHorizontal: resize(12),
		paddingVertical: resize(10),
		borderRadius: resize(10),
		backgroundColor: lighterMoreGray,
		borderWidth: 1,
		borderColor: lightGray,
	},
	unitText: {
		...general.fontSize8,
		color: gray,
	},
	textInputLocked: {
		backgroundColor: lighterMoreGray,
		borderColor: lightGray,
		color: gray,
	},
	switchContainer: {
		flexDirection: 'row',
		alignItems: 'center',
		backgroundColor: white,
		borderRadius: resize(10),
		borderWidth: 1,
		borderColor: lightGray,
		padding: resize(12),
	},
	switchContainerLocked: {
		backgroundColor: lighterMoreGray,
		borderColor: lightGray,
	},
	dateTimeContainer: {
		flexDirection: 'row',
		justifyContent: 'space-between',
	},
	dateTimeButton: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: white,
		borderRadius: resize(10),
		borderWidth: 1,
		borderColor: lightGray,
		padding: resize(12),
		marginHorizontal: resize(4),
	},
	dateTimeButtonLocked: {
		backgroundColor: lighterMoreGray,
		borderColor: lightGray,
		opacity: 0.85,
	},
	dateTimeText: {
		...general.fontSize8,
		color: black,
		marginLeft: resize(8),
	},
	placeholderContainer: {
		alignItems: 'center',
		justifyContent: 'center',
		padding: resize(40),
	},
	placeholderInfoText: {
		...general.fontSize8,
		color: gray,
		marginTop: resize(12),
		textAlign: 'center',
	},
	loadingText: {
		...general.fontSize10,
		color: purple,
		marginTop: resize(16),
	},
	errorText: {
		...general.fontSize10,
		color: black,
		marginTop: resize(16),
		textAlign: 'center',
	},
	retryButton: {
		marginTop: resize(20),
		backgroundColor: purple,
		paddingHorizontal: resize(24),
		paddingVertical: resize(12),
		borderRadius: resize(10),
	},
	retryButtonText: {
		...general.fontSize8,
		color: white,
	},

	// ── Photo section ─────────────────────────────────────────────────
	photoSection: {
		marginHorizontal: resize(16),
		marginBottom: resize(12),
		paddingHorizontal: resize(16),
		paddingTop: resize(18),
		paddingBottom: resize(16),
		backgroundColor: white,
		borderRadius: resize(18),
		...general.shaddowLighter,
	},
	photoLabelRow: {
		flexDirection: 'row',
		alignItems: 'center',
		marginBottom: resize(10),
		gap: resize(8),
	},
	photoLabelBadge: {
		width: resize(26),
		height: resize(26),
		borderRadius: resize(8),
		backgroundColor: purple,
		alignItems: 'center',
		justifyContent: 'center',
	},
	photoLabel: {
		...general.fontSize10,
		color: black,
	},
	photoHintCard: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: resize(8),
		backgroundColor: purple + '10',
		borderRadius: resize(12),
		paddingVertical: resize(10),
		paddingHorizontal: resize(12),
		marginBottom: resize(14),
	},
	photoHintText: {
		...general.fontSize7,
		color: purple,
		flex: 1,
		lineHeight: resize(18),
	},
	photoLoadingCard: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: resize(10),
		backgroundColor: lighterMoreGray,
		borderRadius: resize(16),
		paddingVertical: resize(16),
		marginBottom: resize(10),
	},
	photoLoadingText: {
		...general.fontSize8,
		color: gray,
	},
	photoErrorCard: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: resize(8),
		backgroundColor: lightOrange,
		borderRadius: resize(12),
		paddingVertical: resize(10),
		paddingHorizontal: resize(12),
		marginBottom: resize(10),
	},
	photoErrorText: {
		...general.fontSize7,
		color: orange,
		flex: 1,
	},
	photoCard: {
		borderRadius: resize(18),
		overflow: 'hidden',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.12,
		shadowRadius: 8,
		elevation: 4,
	},
	photoPreview: {
		width: '100%',
		height: resize(200),
		backgroundColor: lighterMoreGray,
	},
	photoCheckBadge: {
		position: 'absolute',
		top: resize(10),
		right: resize(10),
		backgroundColor: 'rgba(43, 180, 88, 0.85)',
		borderRadius: resize(14),
		padding: resize(4),
	},
	photoActionsRow: {
		flexDirection: 'row',
		gap: resize(10),
		marginTop: resize(10),
	},
	photoActionButton: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: resize(7),
		backgroundColor: purple,
		borderRadius: resize(12),
		paddingVertical: resize(11),
	},
	photoActionText: {
		...general.fontSize8,
		color: white,
	},
	photoRemoveButton: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'center',
		gap: resize(7),
		backgroundColor: lightOrange,
		borderRadius: resize(12),
		paddingVertical: resize(11),
		borderWidth: 1,
		borderColor: orange + '50',
	},
	photoRemoveText: {
		...general.fontSize8,
		color: orange,
	},
	photoEmptyCard: {
		borderRadius: resize(18),
		borderWidth: 2,
		borderColor: purple + '40',
		borderStyle: 'dashed',
		backgroundColor: purple + '06',
		alignItems: 'center',
		justifyContent: 'center',
		paddingVertical: resize(34),
		gap: resize(6),
	},
	photoEmptyIconWrap: {
		width: resize(72),
		height: resize(72),
		borderRadius: resize(36),
		backgroundColor: purple + '12',
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: resize(4),
	},
	photoEmptyTitle: {
		...general.fontSize10,
		color: purple,
	},
	photoEmptySubtitle: {
		...general.fontSize7,
		color: gray,
	},

	// ── Camera modal ──────────────────────────────────────────────────
	cameraContainer: {
		flex: 1,
		backgroundColor: 'black',
	},
	camera: {
		flex: 1,
	},
	cameraTopBar: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		paddingTop: resize(44),
		paddingHorizontal: resize(16),
		paddingBottom: resize(12),
		flexDirection: 'row',
		alignItems: 'flex-start',
		justifyContent: 'space-between',
		backgroundColor: 'rgba(0,0,0,0.40)',
	},
	cameraTopBarLeft: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: resize(8),
		marginRight: resize(12),
	},
	cameraTopHint: {
		...general.fontSize7,
		color: white,
		lineHeight: resize(17),
		flex: 1,
	},
	cameraTopButton: {
		backgroundColor: 'rgba(255,255,255,0.15)',
		borderRadius: resize(18),
		padding: resize(6),
	},
	viewfinderWrap: {
		position: 'absolute',
		top: 0, left: 0, right: 0, bottom: 0,
		alignItems: 'center',
		justifyContent: 'center',
	},
	corner: {
		position: 'absolute',
		width: resize(28),
		height: resize(28),
		borderColor: white,
		borderWidth: 3,
	},
	cornerTL: {
		top: '25%',
		left: '10%',
		borderRightWidth: 0,
		borderBottomWidth: 0,
		borderTopLeftRadius: resize(6),
	},
	cornerTR: {
		top: '25%',
		right: '10%',
		borderLeftWidth: 0,
		borderBottomWidth: 0,
		borderTopRightRadius: resize(6),
	},
	cornerBL: {
		bottom: '25%',
		left: '10%',
		borderRightWidth: 0,
		borderTopWidth: 0,
		borderBottomLeftRadius: resize(6),
	},
	cornerBR: {
		bottom: '25%',
		right: '10%',
		borderLeftWidth: 0,
		borderTopWidth: 0,
		borderBottomRightRadius: resize(6),
	},
	cameraControls: {
		position: 'absolute',
		left: 0,
		right: 0,
		bottom: 0,
		paddingBottom: resize(40),
		paddingTop: resize(20),
		alignItems: 'center',
		justifyContent: 'center',
		backgroundColor: 'rgba(0,0,0,0.40)',
	},
	shutterButton: {
		width: resize(74),
		height: resize(74),
		borderRadius: resize(37),
		borderWidth: 4,
		borderColor: white,
		alignItems: 'center',
		justifyContent: 'center',
	},
	shutterInner: {
		width: resize(58),
		height: resize(58),
		borderRadius: resize(29),
		backgroundColor: white,
	},
};

export default NotaConstatareScreen;
