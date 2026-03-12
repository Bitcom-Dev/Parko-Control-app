import { ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { useAuth, useSession } from '../context/userContext';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { black, gray, orange, purple, white } from '../util/colors';
import {  Stack, router } from 'expo-router';
import Logo from '../util/Logo';
import { CustomTextBold, CustomTextInputFloating, CustomTextMedium } from '../util/CustomText';
import { general, resize } from '../util/style';
import { StatusBar } from 'expo-status-bar';
import { authInstance } from '../util/instances';
import LogoCheck from '../assets/LogoCheck';
import useMessage from '../util/messages';
import { SafeAreaView } from 'react-native-safe-area-context';

const SignIn = () => {
	const { signIn } = useSession();
	const [loading, setLoading] = useState(false);
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const passwordRef = useRef(null);
	const { AuthScreen: strings } = useMessage();
	const auth = useAuth();

	const login = () => {
		if (loading)
			return;
		setLoading(true);
		authInstance(auth).post('/login', { username, password })
		.then(response => {
			signIn(response.data);
			setLoading(false);
			router.replace('/');
		})
		.catch(error => {
			setLoading(false);
			// console.log(error);
			if (error.response && (error.response.status === 401 || error.response.status === 404))
				Alert.alert(strings.error, strings.invalidCredentials);
			else if (error.response && error.response.status === 403)
				Alert.alert(strings.error, strings.deactivatedUser);
			else if (error.response && error.response.status === 400)
				Alert.alert(strings.error, strings.connectionError);
		});
	};

	return (
		<SafeAreaView style={{ flex: 1, justifyContent: 'flex-start', alignItems: 'center', backgroundColor: white }}>
			<Stack.Screen options={{ title: strings.welcome, headerTitleStyle: { ...general.fontSize12 ,fontFamily: "Poppins_500Medium" }, headerStyle: { ...general.shaddowLighter } }} />
			<LogoCheck style={{maxWidth: resize(370), flexBasis: 150}} />
			<CustomTextInputFloating
				value={username}
				onChangeText={setUsername}
				style={{...general.fontSize12, width: "80%", marginVertical: resize(25), marginTop: resize(50)}}
				styleTextInput={{ ...general.fontSize12, color: black }}
				selectionColor={purple}
				label={strings.username}
				onSubmitEditing={() => passwordRef.current.focus()}
				rightIcon={'person'}
			/>
			<CustomTextInputFloating
				ref={passwordRef}
				value={password}
				onChangeText={setPassword}
				style={{...general.fontSize12, width: "80%", marginVertical: resize(25)}}
				styleTextInput={{ ...general.fontSize12, color: black }}
				selectionColor={purple}
				label={strings.password}
				secureTextEntryToogle={true}
				onSubmitEditing={login}
			/>
			<TouchableOpacity activeOpacity={.7} onPress={login} style={{ width: "80%", marginVertical: resize(50), paddingVertical: resize(15), backgroundColor: orange, borderRadius: resize(10), justifyContent: 'center', alignItems: 'center', flexDirection: 'row'}}> 
				<CustomTextMedium style={{...general.fontSize16, color: white, letterSpacing: resize(4)}}>
					{strings.login}
				</CustomTextMedium>
				{loading && <ActivityIndicator size="small" color={white} style={{marginHorizontal: resize(10)}}/> }
			</TouchableOpacity>
		</SafeAreaView>
	);
};

export default SignIn;