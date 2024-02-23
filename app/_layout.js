import { Slot } from 'expo-router';
import { SessionProvider } from '../context/userContext';
import { useEffect, useState } from 'react';
import SplashScreen from '../screens/SplashScreen';
import { useFonts } from 'expo-font';
import { Poppins_400Regular, Poppins_500Medium, Poppins_700Bold } from '@expo-google-fonts/poppins';
import { Raleway_400Regular, Raleway_500Medium } from '@expo-google-fonts/raleway';
import { white } from '../util/colors';
import { StatusBar } from 'expo-status-bar';

export default function Root() {
	let [fontsLoaded] = useFonts({
		Poppins_400Regular,
		Poppins_500Medium,
		Poppins_700Bold,
		Raleway_400Regular,
		Raleway_500Medium,
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
            <Slot />
        </SessionProvider>
	);
}