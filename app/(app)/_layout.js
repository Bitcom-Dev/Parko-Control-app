import { Redirect, Stack } from 'expo-router';
import { useSession } from '../../context/userContext';
import { purple } from '../../util/colors';

export default function Root() {
	const { isLoggedIn } = useSession();

	if (!isLoggedIn) {
		return <Redirect href="/signIn" />;
	}

    return (
        <Stack 
			screenOptions={{
				headerStyle: {
					backgroundColor: purple,
				},
				headerTintColor: '#fff',
				headerTitleAlign: 'center',
				headerTitleStyle: {
					fontWeight: 'bold',
				},
				statusBarColor: purple,
				statusBarStyle: 'light',
				title: "Parko Control",
                statusBarAnimation: 'fade'
		  	}}
		>
			<Stack.Screen 
				name='settings'
				options={{
					headerShown: false
				}}
			/>
		</Stack>
	);
}