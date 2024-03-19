import { Slot, Stack } from 'expo-router';
import { SessionProvider } from '../context/userContext';
import { useEffect, useState } from 'react';
import SplashScreen from '../screens/SplashScreen';
import { useFonts } from 'expo-font';
import { Poppins_400Regular, Poppins_500Medium, Poppins_700Bold } from '@expo-google-fonts/poppins';
import { black, gray, purple, white } from '../util/colors';
import { useMessage } from '../util/messages';

export default function Root() {
	let [fontsLoaded] = useFonts({
		Poppins_400Regular,
		Poppins_500Medium,
		Poppins_700Bold,
	});	
	
	const [appIsReady, setAppIsReady] = useState(false);

	useEffect(() => {
	if ( !fontsLoaded )
		return;
	setAppIsReady(true);
	}, [fontsLoaded]);


	if (!appIsReady) return <SplashScreen />;

    return (
        <SessionProvider>
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