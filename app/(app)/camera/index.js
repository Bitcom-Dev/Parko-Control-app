import {View, StyleSheet, Text, SafeAreaView, ScrollView, TouchableOpacity, ActivityIndicator} from 'react-native';
import { CustomTextMedium, CustomTextRegular } from '../../../util/CustomText';
import { resize, general } from '../../../util/style';
import { black, gray, green, orange, purple, white } from '../../../util/colors';
import { FontAwesome6, MaterialIcons, Feather, AntDesign } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useMessage } from '../../../util/messages';
import { useAuth, useSession } from '../../../context/userContext';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { FlashList } from '@shopify/flash-list';
import { controlInstance } from '../../../util/instances';
import useWebsocket from '../../../util/useWebsocket';

const Index = () => {
    const { CameraScreen: strings } = useMessage();
    const [permission, requestPermission] = useCameraPermissions();
    const { user } = useSession();
    const cameraRef = useRef();
    const interval = useRef();
    const [ready, setReady] = useState(false);
    const [play, setPlay] = useState(false);
    const [shutter, setShutter] = useState(false);
	const [history, setHistory] = useState([]);
    // const [size, setSize] = useState("");
    const onMessage = (event) => {
        console.log(event.data);
        const data = JSON.parse(event.data);
        if(data.type === 'DETECTION') {
            setHistory(prev => {
                const oneMinute = 60 * 1000;
                const currentTime = new Date(data.payload.ts).getTime();

                const exists = prev.some(item => {
                    const itemTime = new Date(item.ts).getTime();
                    return item.vehicle === data.payload.vehicle && (currentTime - itemTime) < oneMinute;
                });

                if (exists) {
                    return prev;
                } else {
                    return [data.payload, ...prev];
                }
            });
        }
    }
    const [sendMessage, connected] = useWebsocket('wss://control.parko.ai/ws', onMessage);

    const cameraReady = async () => {
        console.log('Camera Ready');
        // let sizes = await cameraRef.current.getAvailablePictureSizesAsync();
        // sizes.sort((a, b) => {
        //     const [widthA, heightA] = a.split('x').map(Number);
        //     const [widthB, heightB] = b.split('x').map(Number);
        
        //     if (widthA === widthB) {
        //         return heightA - heightB;
        //     }
        //     return widthA - widthB;
        // });
        // if (sizes.length > 0) {
        //     setSize(sizes[0]);
        // }
        setReady(true);
    };

    const processPicture = (photo) => {
        console.log('Processing Picture');
        console.log(photo.width, photo.height);

        if(!connected) return;

        sendMessage(JSON.stringify({type: "DETECTION", payload: {frame: photo.base64}}));
    }
    const takePicture = () => {
        interval.current = setInterval(() => {
            console.log('Taking Picture');
            cameraRef.current.takePictureAsync({base64: true, imageType: 'jpg', onPictureSaved: processPicture, quality: 0, skipProcessing: false})
        }, 500);
    }

    useEffect(() => {
        if (play) {
            takePicture();
        }
        else {
            console.log('Clearing Timeout');
            clearInterval(interval.current);
        }
        return () => {
            console.log('Clearing Timeout');
            clearInterval(interval.current);
        }
    }, [play]);
    

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

    const HistoryPlate = (props) => {
		return (
			<TouchableOpacity activeOpacity={0.7} style={{flexDirection: 'row', marginHorizontal: resize(20), borderBottomColor: gray, borderBottomWidth: resize(2), marginVertical: resize(10), alignItems: 'flex-end', gap: resize(10), paddingHorizontal: resize(10)}}>
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
        <SafeAreaView style={{marginVertical: resize(15), flex: 1, gap: resize(15)}}>
            <View style={{flex: 1, borderRadius: resize(10), overflow: 'hidden', paddingHorizontal: resize(10)}}>
                {permission?.granted ? 
                    (
                        <CameraView style={{flex: 1, justifyContent: 'space-between', flexDirection: 'row', alignItems: 'flex-end'}} facing='back' ref={cameraRef } onCameraReady={cameraReady} animateShutter={shutter} mute={true} videoQuality='720p'>
                            <TouchableOpacity disabled={!ready} style={{margin: resize(20)}} onPress={() => setPlay(!play)} >
                                {ready ? 
                                    <FontAwesome6 name={!play ? 'play' : 'pause'} size={resize(50)} color={purple}/> 
                                :
                                    <ActivityIndicator size='large' color={purple} />
                                }
                            </TouchableOpacity>
                            <TouchableOpacity disabled={!ready} style={{margin: resize(20)}} onPress={() => setShutter(!shutter)} >
                                {ready ? 
                                    <View>
                                        <MaterialIcons name={'shutter-speed'} size={resize(45)} color={purple}/>
                                        {shutter && <Feather name="x" size={resize(50)} color={white} style={{position:'absolute', right: resize(2)}}/>} 
                                    </View>
                                :
                                    <ActivityIndicator size='large' color={purple} />
                                }
                            </TouchableOpacity>
                        </CameraView>
                    ) :
                    (
                        <View style={{justifyContent: 'center', alignItems: 'center', flex: 1}}>
                            <CustomTextMedium style={{...general.fontSize12, color: gray}}>{strings.permission}</CustomTextMedium>
                            <TouchableOpacity onPress={requestPermission} style={{backgroundColor: purple, padding: resize(10), borderRadius: resize(10), marginTop: resize(10)}}>
                                <CustomTextMedium style={{...general.fontSize8, color: white}}>{strings.request}</CustomTextMedium>
                            </TouchableOpacity>
                        </View>
                    )
                }
            </View>
            <View style={{flex: 2}}>
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
				/>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({})

