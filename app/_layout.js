import { Slot, Stack } from 'expo-router';
import { SessionProvider, useSession } from '../context/userContext';
import { useEffect, useState } from 'react';
import SplashScreen from '../screens/SplashScreen';
import { useFonts } from 'expo-font';
import { Poppins_400Regular, Poppins_500Medium, Poppins_700Bold } from '@expo-google-fonts/poppins';
import { black, gray, purple, white } from '../util/colors';
import { useMessage } from '../util/messages';
import { removeValue, retrieveValue, saveValue } from '../util/storage';

export default function Root() {
	let [fontsLoaded] = useFonts({
		Poppins_400Regular,
		Poppins_500Medium,
		Poppins_700Bold,
	});	

	const [isLoggedIn, setLoggedIn] = useState(false);
    const [accessToken, setAccessToken] = useState(null);
    const [refreshToken, setRefreshToken] = useState(null);
    const [language, setLanguage] = useState("ro");
    const [uuid, setUUID] = useState(null);
    const [user, setUser] = useState(null);
	const [appIsReady, setAppIsReady] = useState(false);

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
        signOut: () => {
            setUser(undefined);
        },
		signIn: (data) => {
			setUser({username: data.username, fullName: data.fullName});
			setAccessToken(data.accessToken);
			setRefreshToken(data.refreshToken);
			setUUID(data.uuid);
		}
    };

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
		console.log(user);
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
	if ( !fontsLoaded || user === null)
		return;
	setAppIsReady(true);
	}, [fontsLoaded,user]);


	if (!appIsReady) return <SplashScreen />;

    return (
        <SessionProvider value={userConfig}>
            <Stack
				screenOptions={{
					headerShown: false
				}}
			>
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
	);
}