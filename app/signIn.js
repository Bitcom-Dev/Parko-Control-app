import { ActivityIndicator, SafeAreaView, Text, TouchableOpacity, View } from 'react-native';
import { useAuth, useSession } from '../context/userContext';
import { useEffect, useRef, useState } from 'react';
import { black, purple, white } from '../util/colors';
import {  router } from 'expo-router';
import Logo from '../util/Logo';
import { CustomTextBold, CustomTextInputFloating, CustomTextMedium } from '../util/CustomText';
import { general, resize } from '../util/style';
import { useMessage } from '../util/messages';
import { StatusBar } from 'expo-status-bar';
import { authInstance } from '../util/instances';

export default function SignIn() {
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
			console.error(error);
		});
	};

	return (
		<SafeAreaView style={{ flex: 1, justifyContent: 'flex-start', alignItems: 'center', paddingTop: resize(100) }}>
			<StatusBar style="dark" backgroundColor={white} />
			<Logo style={{maxWidth: 500, flexBasis: 150}} />
			<CustomTextMedium style={{...general.fontSize16, marginBottom: resize(125)}}>
				{strings.welcome}
			</CustomTextMedium>
			<CustomTextInputFloating
				value={username}
				onChangeText={setUsername}
				style={{...general.fontSize14, width: "80%", marginVertical: resize(25)}}
				styleTextInput={{ ...general.fontSize14, color: black }}
				selectionColor={purple}
				label={strings.username}
				onSubmitEditing={() => passwordRef.current.focus()}
			/>
			<CustomTextInputFloating
				ref={passwordRef}
				value={password}
				onChangeText={setPassword}
				style={{...general.fontSize14, width: "80%", marginVertical: resize(25)}}
				styleTextInput={{ ...general.fontSize14, color: black }}
				selectionColor={purple}
				label={strings.password}
				secureTextEntryToogle={true}
				onSubmitEditing={signIn}
			/>
			<TouchableOpacity activeOpacity={.7} onPress={login} style={{ width: "80%", marginVertical: resize(50), paddingVertical: resize(15), backgroundColor: purple, borderRadius: resize(10), justifyContent: 'center', alignItems: 'center', flexDirection: 'row'}}> 
				<CustomTextMedium style={{...general.fontSize16, color: white, letterSpacing: resize(4)}}>
					{strings.login}
				</CustomTextMedium>
				{loading && <ActivityIndicator size="small" color={white} style={{marginHorizontal: resize(10)}}/> }
			</TouchableOpacity>
		</SafeAreaView>
	);
}