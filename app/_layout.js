import { Slot, Stack } from 'expo-router';
import SessionProvider from '../context/userContext';
import { useEffect, useState, useRef } from 'react';
import { AppState, Alert } from 'react-native';
import SplashScreen from '../screens/SplashScreen';
import { useFonts } from 'expo-font';
import { Poppins_400Regular, Poppins_500Medium, Poppins_700Bold } from '@expo-google-fonts/poppins';
import {
	RobotoMono_400Regular,
	RobotoMono_700Bold,
} from '@expo-google-fonts/roboto-mono';
import { black, gray, purple, white } from '../util/colors';
import { useMessage } from '../util/messages';
import { removeValue, retrieveValue, saveValue } from '../util/storage';
import * as Location from 'expo-location';
import { authInstance } from '../util/instances';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const Layout = () => {
	let [fontsLoaded] = useFonts({
		Poppins_400Regular,
		Poppins_500Medium,
		Poppins_700Bold,
		RobotoMono_400Regular,
		RobotoMono_700Bold,
	});	

	const [isLoggedIn, setLoggedIn] = useState(false);
    const [accessToken, setAccessToken] = useState(null);
    const [refreshToken, setRefreshToken] = useState(null);
    const [language, setLanguage] = useState("ro");
    const [uuid, setUUID] = useState(null);
    const [user, setUser] = useState(null);
	const [appIsReady, setAppIsReady] = useState(false);
	const [minTimeReached, setMinTimeReached] = useState(false);
	const [location, setLocation] = useState(null);
	const [locationPermission, setLocationPermission] = useState(null);
	const [appState, setAppState] = useState(AppState.currentState);
	const lastSentLocationRef = useRef(null);

	const userConfig = {
        isLoggedIn,
        setLoggedIn,
        accessToken,
        setAccessToken,
        uuid,
        setUUID,
        refreshToken,
        setRefreshToken,
        user,
        setUser,
        language,
        setLanguage,
		location,
		setLocation,
		locationPermission,
		setLocationPermission,
        signOut: () => {
            setUser(undefined);
        },
		signIn: (data) => {
			setUser({username: data.username, fullName: data.fullName, modules: data.modules});
			setAccessToken(data.accessToken);
			setRefreshToken(data.refreshToken);
			setUUID(data.uuid);
		}
    };

	const getLocationPermission = async () => {
		try {
			
			const { status } = await Location.requestForegroundPermissionsAsync();
			if (status !== 'granted') {
				setLocationPermission(false);
				setLocation(undefined);
				Alert.alert(strings.LocationScreen.error, strings.LocationScreen.permissionDenied);
			}
			if (status === 'granted') {
				setLocationPermission(true);
			}
		} catch (error) {
			setLocationPermission(false);
			setLocation(undefined);
			Alert.alert(strings.LocationScreen.error, strings.LocationScreen.locationError);
		}
	};

	const getMyLocation = async () => {
		try {
			const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
			if (loc?.coords?.latitude != null) {
				return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
			}
		} catch (_) {
			// getCurrentPositionAsync failed (services off / timeout) — try last known
		}
		try {
			const last = await Location.getLastKnownPositionAsync();
			if (last?.coords?.latitude != null) {
				return { latitude: last.coords.latitude, longitude: last.coords.longitude };
			}
		} catch (_) {
			// no last known position either
		}
		return undefined;
	};

	const getDistanceInMeters = (loc1, loc2) => {
		// Haversine formula to calculate distance between two GPS coordinates
		const R = 6371000; // Earth radius in meters
		const lat1 = (loc1.latitude * Math.PI) / 180;
		const lat2 = (loc2.latitude * Math.PI) / 180;
		const deltaLat = ((loc2.latitude - loc1.latitude) * Math.PI) / 180;
		const deltaLon = ((loc2.longitude - loc1.longitude) * Math.PI) / 180;
		
		const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
				  Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
		
		const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
		
		return R * c; // Distance in meters
	}

	useEffect(() => {
		if (uuid === null) {
		  retrieveValue("uuid", setUUID);
		} else if (user === undefined) {
		  removeValue("uuid");
		} else {
		  saveValue("uuid", uuid);
		}
	  }, [uuid]);
	
	  useEffect(() => {
		if (language === null) {
		  retrieveValue("language", (e) => setLanguage(e ? e : "ro"));
		} else {
		  saveValue("language", language);
		}
	  }, [language]);
	
	  useEffect(() => {
		if (user === null) {
		  retrieveValue("user", (e) => {
			setUser(e ? JSON.parse(e) : e);
		  });
		} else if (user === undefined) {
		  removeValue("user");
		  setAccessToken(undefined);
		  setRefreshToken(undefined);
		  setUUID(undefined);
		} else {
		  saveValue("user", JSON.stringify(user));
		}

		if (user) {
		  setLoggedIn(true);
		} else {
		  setLoggedIn(false);
		}
	  }, [user]);
	
	  useEffect(() => {
		if (accessToken === null) {
		  retrieveValue("accessToken", setAccessToken);
		} else if (accessToken === undefined) {
		  removeValue("accessToken");
		} else {
		  saveValue("accessToken", accessToken);
		}
	  }, [accessToken]);
	
	  useEffect(() => {
		if (refreshToken === null) {
		  retrieveValue("refreshToken", setRefreshToken);
		} else if (refreshToken === undefined) {
		  removeValue("refreshToken");
		} else {
		  saveValue("refreshToken", refreshToken);
		}
	  }, [refreshToken]);

	useEffect(() => {
		const timer = setTimeout(() => setMinTimeReached(true), 4000);
		return () => clearTimeout(timer);
	}, []);

	useEffect(() => {
		if ( !fontsLoaded || user === null)
			return;
		setAppIsReady(true);
	}, [fontsLoaded, user]);

	useEffect(() => {
		const subscription = AppState.addEventListener('change', nextAppState => {
			setAppState(nextAppState);
		});

		return () => {
			subscription.remove();
		};
	}, []);

	useEffect(() => {
		if (appIsReady) {
			getLocationPermission();
		}
	}, [appIsReady]);

	useEffect(() => {
		if (appState !== 'active' || !locationPermission) {
			return;
		}
		
		const fetchLocation = async () => {
			try {
				const loc = await getMyLocation();
				setLocation(loc);
			} catch (_) {
				setLocation(undefined);
			}
		};

		fetchLocation();
		
		const intervalId = setInterval(fetchLocation, 5000);
		
		return () => {
			clearInterval(intervalId);
		};
	}, [appState, locationPermission]);

	useEffect(() => {
		if (!location || !user || !accessToken) return;
		
		// Calculate distance from last sent location
		const hasMoved = () => {
			if (!lastSentLocationRef.current) return true;
			
			const distance = getDistanceInMeters(
				lastSentLocationRef.current,
				location
			);
			return distance > 5; // Only send if moved > 5 meters
		};
		
		if (!hasMoved()) return;
		
		const sendLocation = async () => {
				try {
					await authInstance(userConfig).post('/location', {
						latitude: location.latitude,
						longitude: location.longitude
					});
					lastSentLocationRef.current = location;
				} catch (error) {
					// console.error('Failed to send location:', error);
				}
			};
			
			sendLocation();
	}, [location, user, accessToken]);

	if (!appIsReady || !minTimeReached) return <SplashScreen />;

    return (
		<GestureHandlerRootView style={{ flex: 1 }}>
        <SessionProvider value={userConfig}>
            <Stack
				screenOptions={{
					headerShown: false
				}}
			>
				<Stack.Screen name='(app)' />
				<Stack.Screen
					name='signIn'
					options={{
						headerShown: true,
						headerTitleAlign: 'center',
						presentation: 'modal',
						statusBarColor: white,
						statusBarStyle: 'dark',
						statusBarAnimation: 'fade',
						headerTintColor: black,
						gestureEnabled: true,
					}}
				/>
			</Stack>
        </SessionProvider>
		</GestureHandlerRootView>
	);
};

export default Layout;