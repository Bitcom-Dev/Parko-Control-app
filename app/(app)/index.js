import { Link, Stack, router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons, MaterialIcons, AntDesign, FontAwesome6, MaterialCommunityIcons } from '@expo/vector-icons';
import { resize, general } from "../../util/style";
import { black, gray, green, orange, purple, red, white } from "../../util/colors";
import { CustomTextBold, CustomTextInputFloating, CustomTextMedium, CustomTextRegular } from "../../util/CustomText";
import { useCallback, useEffect, useState } from "react";
import { useMessage } from "../../util/messages";
import { controlInstance } from "../../util/instances";
import { useAuth } from "../../context/userContext";
import { FlashList } from "@shopify/flash-list";

export default function Index() {
    const { HomeScreen: strings } = useMessage();
    const [loading, setLoading] = useState(false);
    const [loadingHistory, setLoadingHistory] = useState(false);
	const { vehicleSelected="", details=null, tsSelected } = useLocalSearchParams();
    const [vehicle, setVehicle] = useState(vehicleSelected);
    const [ts, setTs] = useState(tsSelected);
    const [session, setSession] = useState(JSON.parse(details));
	const [history, setHistory] = useState([]);
	const auth = useAuth();


	const loadData = () => {
		if (loadingHistory)
			return;
		setLoadingHistory(true);
		controlInstance(auth).get('/history', {params: {offset: 0, limit: 4}})
		.then(response => {
			setHistory(response.data);
		})
		.catch(error => {
			console.log(error);
		})
		.finally(() => {
			setLoadingHistory(false);
		});
	}

    useFocusEffect(
		useCallback(() => {
			loadData();
		}, [])
	);

	function formatDate(dateString) {
		const date = new Date(dateString);
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');

		return `${day}-${month}-${year}`;
	}

	function formatTime(dateString) {
		const date = new Date(dateString);
		const hours = String(date.getHours()).padStart(2, '0');
		const minutes = String(date.getMinutes()).padStart(2, '0');

		return `${hours}:${minutes}`;
	}

	const timeAgo = (dateString) => {
		const date = new Date(dateString);
		const now = new Date();
	
		const secondsPast = (now.getTime() - date.getTime()) / 1000;
	
		if(secondsPast < 60) {
			return strings.now;
		}
		if(secondsPast < 3600) {
			return parseInt(secondsPast / 60) + ' ' + strings.minutes;
		}
		if(secondsPast <= 86400) {
			return parseInt(secondsPast / 3600) + ' ' + strings.hours;
		}
		if(secondsPast > 86400) {
			const day = parseInt(secondsPast / 86400);
			if(day <= 7) {
				return day + ' ' + strings.days;
			} else if(day <= 30) {
				const week = parseInt(day / 7);
				return week + ' ' + strings.weeks;
			} else if(day <= 365) {
				const month = parseInt(day / 30);
				return month + ' ' + strings.months;
			} else {
				const year = parseInt(day / 365);
				return year + ' ' + strings.years;
			}
		}
	}

	const overtime = (dateString) => {
		const date = new Date(dateString);
		const now = new Date();
	
		const secondsPast = (now.getTime() - date.getTime()) / 1000;
	
		if(secondsPast < 60) {
			return "0 " + strings.minutes;
		}
		if(secondsPast < 3600) {
			return parseInt(secondsPast / 60) + ' ' + strings.minutes;
		}
		if(secondsPast <= 86400) {
			return parseInt(secondsPast / 3600) + ' ' + strings.hours;
		}
		if(secondsPast > 86400) {
			const day = parseInt(secondsPast / 86400);
			if(day <= 7) {
				return day + ' ' + strings.days;
			} else if(day <= 30) {
				const week = parseInt(day / 7);
				return week + ' ' + strings.weeks;
			} else if(day <= 365) {
				const month = parseInt(day / 30);
				return month + ' ' + strings.months;
			} else {
				const year = parseInt(day / 365);
				return year + ' ' + strings.years;
			}
		}
	}
	
    const verifyVehicle = () => {
		if(loading)
			return;

        if (vehicle === ""){
			setSession(null);
            return;
		}
		setTs(undefined);
        setLoading(true);
		setSession(undefined);
		controlInstance(auth).get(`/${vehicle}`)
		.then(response => {
			setLoading(false);
			setSession({...response.data, active: 1});
		})
		.catch(error => {
			setLoading(false);
			if (error.response && error.response.status === 404)
				if (error.response.data.vehicle)
					setSession({...error.response.data, active: 0});
				else
					setSession(undefined);
			else if (error.response && error.response.status === 403){
				Alert.alert(strings.error, strings.noUser);
				auth.signOut();
				router.replace('/signIn');
			}
			else if (error.response && (error.response.status === 400 || error.response.status === 500)) {
				setSession(null);
				Alert.alert(strings.error, strings.connectionError);
			}
		})
		.finally(() => {
			loadData();
		});
    };

	const HistoryPlate = (props) => {
		return (
			<TouchableOpacity activeOpacity={0.7} style={{flexDirection: 'row', marginHorizontal: resize(20), borderBottomColor: gray, borderBottomWidth: resize(2), marginVertical: resize(10), alignItems: 'flex-end', gap: resize(10), paddingHorizontal: resize(10)}} onPress={() => {setVehicle(props.vehicle);setSession({...props.details, active: props.active});setTs(props.ts);}}>
				<View style={{flexGrow: 1, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center'}}>
					<CustomTextMedium style={{...general.fontSize12, color: black}}>
						{props.vehicle}
					</CustomTextMedium>
					<CustomTextMedium style={{...general.fontSize10, color: purple}}>
						{timeAgo(props.ts*1000)}
					</CustomTextMedium>
				</View>
				<AntDesign name={props.active ? "checkcircle" : "closecircle"} size={resize(30)} color={props.active ? green : orange} style={{alignSelf: 'flex-start'}}/>
			</TouchableOpacity>
		);
	}
	
    return (
        <View style={{ flex: 1, justifyContent: 'flex-start', alignItems: 'center', backgroundColor: white }}>
            <Stack.Screen 
            options={{
                headerRight: () => (
                    <Link href="/settings" asChild>
                        <TouchableOpacity style={{borderRadius: resize(20), overflow: 'hidden'}}>
                            <Ionicons name="person" size={resize(35)} color={purple} />
                        </TouchableOpacity>
                    </Link>
                ),
				headerLeft: () => (
					<Link href="/camera" asChild>
                        <TouchableOpacity style={{borderRadius: resize(20), overflow: 'hidden'}}>
                            <Ionicons name="camera" size={resize(35)} color={purple} />
                        </TouchableOpacity>
                    </Link>
				),
            }}/>
            <CustomTextInputFloating
                value={vehicle}
				autoCapitalize = {"characters"}
				onChangeText={(e) => setVehicle(e.trim().toUpperCase())}
				style={{...general.fontSize10, width: "85%", marginTop: resize(50)}}
				styleTextInput={{ ...general.fontSize10, color: black }}
				selectionColor={purple}
				label={strings.vehicle}
                returnKeyType="search"
				onSubmitEditing={verifyVehicle}
                onBlur={verifyVehicle}
				editable={!loading}
				rightIcon={'car-sport'}
				rightIconColor={orange}
				rightIconSize={resize(35)}
				rightIconBottom={resize(1)}
				rightIconRight={resize(5)}
            />
			<CustomTextBold style={{...general.fontSize4, marginBottom: resize(20), color: gray, width: "85%", marginTop: resize(5)}}>
				{strings.vehicleIEnter}
			</CustomTextBold>
            { session !== null && loading === true ?
                <View style={{flexGrow: 1, justifyContent: 'center', alignItems: 'center', width: '100%'}}>
                    <ActivityIndicator size="large" color={purple}/>
                </View>
				: null
			} 
			{ session !== null && !loading ?
				<View style={{backgroundColor: session?.active ? green : orange, width: "85%", paddingTop: resize(10), paddingBottom: resize(5), justifyContent: 'center', alignItems: 'flex-end', borderRadius: resize(20), marginBottom: resize(30), flexDirection: 'row', gap: resize(10)}}>
					<CustomTextBold style={{...general.fontSize12, textAlign: 'center'}}>
						{session?.active ? strings.active : strings.inactive}{ts ? `\n(${formatDate(ts*1000)} ${formatTime(ts*1000)})` : ""}
					</CustomTextBold>
					<AntDesign name={session?.active ? "like1" : "dislike1"} size={resize(30)} color={black} style={{alignSelf: ts ? 'center' :  'flex-start', paddingBottom: ts ? resize(5) : 0 }}/>
				</View>
				: null
			}
			{ session !== null && session !== undefined && !loading ?
				<View style={{flexGrow: 1, justifyContent: 'space-around', alignItems: 'center', width: '100%', gap: resize(5)}}>
					<View style={{flexDirection: 'row', justifyContent: 'space-between', width: '80%'}}>
						{session.vehicle ? <View style={{flexDirection: 'row',  gap: resize(10), alignItems: 'center', flexBasis: resize(150)}}>
							<Ionicons name="car-sport" size={resize(35)} color={gray} />
							<View>
								<CustomTextBold style={{...general.fontSize4, color: purple}}>
									{strings.vehicle} :
								</CustomTextBold>
								<CustomTextMedium style={{...general.fontSize14}}>
									{session.vehicle}
								</CustomTextMedium>
							</View>
						</View> : null}
						{session.zone ? <View style={{flexDirection: 'row',  gap: resize(10), alignItems: 'center', flexBasis: resize(150)}}>
							<FontAwesome6 name="map-location-dot" size={resize(30)} color={gray} style={{paddingLeft: resize(5)}}/>
							<View>
								<CustomTextBold style={{...general.fontSize4, color: purple}}>
									{strings.zone} :
								</CustomTextBold>
								<CustomTextMedium style={{...general.fontSize14}}>
									{session.zone}
								</CustomTextMedium>
							</View>
						</View> : null}
					</View>
					<View style={{flexDirection: 'row', justifyContent: 'space-between', width: '80%'}}>
						{session.startTime ? <View style={{flexDirection: 'row',  gap: resize(10), alignItems: 'center', flexBasis: resize(150)}}>
							<Ionicons name="time" size={resize(35)} color={gray} />
							<View>
								<CustomTextBold style={{...general.fontSize4, color: purple}}>
									{strings.startTime} :
								</CustomTextBold>
								<CustomTextMedium style={{...general.fontSize14}}>
									{formatTime(session.startTime)}
								</CustomTextMedium>
								<CustomTextMedium style={{...general.fontSize10, marginTop: -resize(10)}}>
									{formatDate(session.startTime)}
								</CustomTextMedium>
							</View>
						</View> : null}
						{session.endTime ? <View style={{flexDirection: 'row',  gap: resize(10), alignItems: 'center', flexBasis: resize(150)}}>
							<MaterialCommunityIcons name="clock-check" size={resize(35)} color={gray} />
							<View>
								<CustomTextBold style={{...general.fontSize4, color: purple}}>
									{strings.endTime} :
								</CustomTextBold>
								<CustomTextMedium style={{...general.fontSize14}}>
									{formatTime(session.endTime)}
								</CustomTextMedium>
								<CustomTextMedium style={{...general.fontSize10, marginTop: -resize(10)}}>
									{formatDate(session.endTime)}
								</CustomTextMedium>
							</View>
						</View> : null}
					</View>
					<View style={{flexDirection: 'row', justifyContent: 'space-between', width: '80%'}}>
						{session.paid ? <View style={{flexDirection: 'row',  gap: resize(10), alignItems: 'center', flexBasis: resize(150)}}>
							<FontAwesome6 name="money-bill-wave" size={resize(30)} color={gray} />
							<View>
								<CustomTextBold style={{...general.fontSize4, color: purple}}>
									{strings.paid} :
								</CustomTextBold>
								<CustomTextMedium style={{...general.fontSize14}}>
									{session.paid} RON
								</CustomTextMedium>
							</View>
						</View> : null}
						{session.zone ? <View style={{flexDirection: 'row',  gap: resize(10), alignItems: 'center',flexBasis: resize(150)}}>
							<MaterialCommunityIcons name="timer-sand-complete" size={resize(40)} color={gray} />
							<View>
								<CustomTextBold style={{...general.fontSize4, color: purple}}>
									{strings.overtime} :
								</CustomTextBold>
								<CustomTextMedium style={{...general.fontSize14}}>
									{overtime(session.endTime)}
								</CustomTextMedium>
							</View>
						</View> : null}
					</View>
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
			<View style={{flexGrow: 1}}/>
			<View style={{flexBasis: resize(300), width: '100%', alignSelf: 'flex-end'}}>
				<View style={{backgroundColor: purple, paddingVertical: resize(10), paddingHorizontal: resize(20), flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end'}}>
					<CustomTextRegular style={{...general.fontSize6, color: white}}>
						{strings.history}
					</CustomTextRegular>
					<MaterialIcons name="history" size={resize(30)} color={orange} />
				</View>
				<FlashList
					data={history}
					renderItem={({ item }) => <HistoryPlate {...item} />}
					estimatedItemSize={resize(50)}
					ListFooterComponent={loadingHistory ? <ActivityIndicator size="large" color={purple} /> : null}
				/>
			</View>

        </View>
    );
}

