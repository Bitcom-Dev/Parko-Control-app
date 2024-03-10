import { Link, Stack, router } from "expo-router";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Feather } from '@expo/vector-icons';
import { resize, general } from "../../util/style";
import { black, green, purple, red, white } from "../../util/colors";
import { CustomTextBold, CustomTextInputFloating, CustomTextMedium, CustomTextRegular } from "../../util/CustomText";
import { useEffect, useState } from "react";
import { useMessage } from "../../util/messages";
import { controlInstance } from "../../util/instances";
import { useAuth } from "../../context/userContext";

export default function Index() {
    const { HomeScreen: strings } = useMessage();
    const [vehicle, setVehicle] = useState("");
    const [loading, setLoading] = useState(false);
    const [session, setSession] = useState(null);
	const auth = useAuth();

	function getRandomInt(min, max) {
		min = Math.ceil(min);
		max = Math.floor(max);
		return Math.floor(Math.random() * (max - min + 1)) + min; //The maximum is inclusive and the minimum is inclusive 
	  }
	  

	function formatDate(dateString) {
		const date = new Date(dateString);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');

		return `${year}-${month}-${day} ${hours}:${minutes}`;
	}
    const verifyVehicle = () => {
		if(loading)
			return;

        if (vehicle === ""){
			setSession(null);
            return;
		}
        setLoading(true);
		setSession(undefined);
		controlInstance(auth).get(`/${vehicle}`)
		.then(response => {
			setLoading(false);
			setSession(response.data);
		})
		.catch(error => {
			setLoading(false);
			console.log(error);
			setSession(undefined);
			if (error.response && error.response.status === 403){
				Alert.alert(strings.error, strings.noUser);
				auth.signOut();
				router.replace('/signIn');
			}
			else if (error.response && (error.response.status === 400 || error.response.status === 500))
				Alert.alert(strings.error, strings.connectionError);
		});
    };
	
    return (
        <ScrollView contentContainerStyle={{ flex: 1, justifyContent: 'flex-start', alignItems: 'center' }}>
            <Stack.Screen 
            options={{
                headerRight: () => (
                    <Link href="/settings" asChild>
                        <TouchableOpacity>
                            <Feather name="user" size={resize(25)} color={white} />
                        </TouchableOpacity>
                    </Link>
                ),
            }}/>
            <CustomTextInputFloating
                value={vehicle}
				autoCapitalize = {"characters"}
				onChangeText={(e) => setVehicle(e.trim().toUpperCase())}
				style={{...general.fontSize14, width: "85%", marginVertical: resize(50)}}
				styleTextInput={{ ...general.fontSize14, color: black }}
				selectionColor={purple}
				label={strings.vehicle}
                returnKeyType="search"
				onSubmitEditing={verifyVehicle}
                onBlur={verifyVehicle}
				editable={!loading}
            />
            { session !== null && loading === true ?
                <View style={{flexGrow: 1, justifyContent: 'center', alignItems: 'center', width: '100%'}}>
                    <ActivityIndicator size="large" color={purple}/>
                </View>
				: null
			} 
			{ session !== null && !loading ?
				<View style={{backgroundColor: session ? green : red, width: "85%", paddingVertical: resize(15), justifyContent: 'center', alignItems: 'center', borderRadius: resize(20), marginBottom: resize(30)}}>
					<CustomTextBold style={{...general.fontSize16}}>
						{session ? strings.active : strings.inactive}
					</CustomTextBold>
				</View>
				: null
			}
			{ session !== null && session !== undefined && !loading ?
				<View style={{flexGrow: 1, justifyContent: 'flex-start', alignItems: 'flex-start', width: '100%', gap: resize(5)}}>
					{session.vehicle ? <View style={{marginHorizontal: resize(40)}}>
						<CustomTextMedium style={{...general.fontSize14}}>
							{strings.vehicle} :
						</CustomTextMedium>
						<CustomTextRegular style={{...general.fontSize14, marginLeft: resize(25)}}>
							{session.vehicle}
						</CustomTextRegular>
					</View> : null}
					{session.startTime ? <View style={{marginHorizontal: resize(40)}}>
						<CustomTextMedium style={{...general.fontSize14}}>
							{strings.startTime} :
						</CustomTextMedium>
						<CustomTextRegular style={{...general.fontSize14, marginLeft: resize(25)}}>
							{formatDate(session.startTime)}
						</CustomTextRegular>
					</View> : null}
					{session.endTime ? <View style={{marginHorizontal: resize(40)}}>
						<CustomTextMedium style={{...general.fontSize14}}>
							{strings.endTime} :
						</CustomTextMedium>
						<CustomTextRegular style={{...general.fontSize14, marginLeft: resize(25)}}>
							{formatDate(session.endTime)}
						</CustomTextRegular>
					</View> : null}
					{session.zone ? <View style={{marginHorizontal: resize(40)}}>
						<CustomTextMedium style={{...general.fontSize14}}>
							{strings.zone} :
						</CustomTextMedium>
						<CustomTextRegular style={{...general.fontSize14, marginLeft: resize(25)}}>
							{session.zone}
						</CustomTextRegular>
					</View> : null}
					{session.parkingLot ? <View style={{marginHorizontal: resize(40)}}>
						<CustomTextMedium style={{...general.fontSize14}}>
							{strings.parkingLot} :
						</CustomTextMedium>
						<CustomTextRegular style={{...general.fontSize14, marginLeft: resize(25)}}>
							{session.parkingLot}
						</CustomTextRegular>
					</View> : null}
					{session.paid ? <View style={{marginHorizontal: resize(40)}}>
						<CustomTextMedium style={{...general.fontSize14}}>
							{strings.paid} :
						</CustomTextMedium>
						<CustomTextRegular style={{...general.fontSize14, marginLeft: resize(25)}}>
							{session.paid} RON
						</CustomTextRegular>
					</View> : null}
				</View> 
				: null
			}
			{ session === undefined && !loading ? <View style={{flexGrow: 1, justifyContent: 'center', alignItems: 'center'}}>
					<CustomTextMedium style={{...general.fontSize16, textAlign: 'center'}}>
						{strings.noSession}
					</CustomTextMedium>
				</View> 
				: null
			}

        </ScrollView>
    );
}

const styles = StyleSheet.create({

});
