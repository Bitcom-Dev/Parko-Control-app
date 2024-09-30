import { Redirect, Stack } from 'expo-router';
import { useSession } from '../../context/userContext';
import { black, purple, white } from '../../util/colors';
import { useEffect } from 'react';

export default function Root() {
	const { isLoggedIn } = useSession();
	
	if (!isLoggedIn) {
		return <Redirect href="/signIn" />;
	}

    return (
        <Stack 
			screenOptions={{
				headerStyle: {
					backgroundColor: white,
				},
				headerTintColor: black,
				headerTitleAlign: 'center',
				headerTitleStyle: {
					fontFamily: 'Poppins_500Medium',
				},
				statusBarColor: white,
				statusBarStyle: 'dark',
				title: "Parko Control",
                statusBarAnimation: 'fade'
		  	}}
		>
			<Stack.Screen 
				name='settings'
				options={{
					headerShown: false,
					animation: 'slide_from_right',
					gestureEnabled: true,
					animationDuration: 50,
					animationTypeForReplace: 'push'
				}}
			/>
			<Stack.Screen 
				name='camera'
				options={{
					headerShown: false,
					animation: 'slide_from_left',
					gestureEnabled: true,
					animationDuration: 50,
					animationTypeForReplace: 'push'
				}}
			/>
		</Stack>
	);
}