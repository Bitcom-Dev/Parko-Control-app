import { Stack } from 'expo-router';
import { purple, white } from '../../../util/colors';
import { useMessage } from '../../../util/messages';

export default function Root() {
    const { CameraScreen: strings } = useMessage();
    return (
        <Stack 
		    screenOptions={{
                title: strings.title,
                headerTitleAlign: 'center',
                presentation: 'modal',
                statusBarColor: purple,
                statusBarStyle: 'light',
                statusBarAnimation: 'fade',
                headerTintColor: white,
                headerStyle: {
                    backgroundColor: purple,
                },
                gestureEnabled: true,
            }}
            
        />
	);
}