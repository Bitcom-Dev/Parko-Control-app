import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { CustomTextMedium, CustomTextRegular } from '../../../util/CustomText';
import { resize, general } from '../../../util/style';
import { black, gray, green, lightGray, lightOrange, orange, purple, white } from '../../../util/colors';
import { FontAwesome6, MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { useMessage } from '../../../util/messages';
import { useSession } from '../../../context/userContext';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useEffect, useRef, useState } from 'react';
import { FlashList } from '@shopify/flash-list';
import useWebsocket from '../../../util/useWebsocket';

const Index = () => {
    const { CameraScreen: strings } = useMessage();
    const [permission, requestPermission] = useCameraPermissions();
    const { user } = useSession();
    const cameraRef = useRef();
    const interval = useRef();
    const capturing = useRef(false);
    const [ready, setReady] = useState(false);
    const [play, setPlay] = useState(false);
    const [shutter, setShutter] = useState(false);
	const [history, setHistory] = useState([]);

    const onMessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'DETECTION') {
            setHistory(prev => {
                const oneMinute = 60 * 1000;
                const currentTime = new Date(data.payload.ts).getTime();
                const exists = prev.some(item => {
                    const itemTime = new Date(item.ts).getTime();
                    return item.vehicle === data.payload.vehicle && (currentTime - itemTime) < oneMinute;
                });
                return exists ? prev : [data.payload, ...prev];
            });
        }
    };
    const [sendMessage, connected] = useWebsocket('wss://control.parko.ai/ws', onMessage);

    const cameraReady = () => setReady(true);

    const processPicture = (photo) => {
        if (!connected) return;
        sendMessage(JSON.stringify({ type: 'DETECTION', payload: { frame: photo.base64 } }));
    };

    const takePicture = () => {
        interval.current = setInterval(async () => {
            if (capturing.current || !cameraRef.current || !ready) return;
            capturing.current = true;
            try {
                const photo = await cameraRef.current.takePictureAsync({
                    base64: true,
                    imageType: 'jpg',
                    quality: 0,
                    skipProcessing: false,
                });
                processPicture(photo);
            } catch (_) {
                // camera not ready / busy — skip this frame
            } finally {
                capturing.current = false;
            }
        }, 500);
    };

    useEffect(() => {
        if (play) takePicture();
        else clearInterval(interval.current);
        return () => clearInterval(interval.current);
    }, [play]);
    

    const timeAgo = (dateString) => {
		const date = new Date(dateString);
		const now = new Date();
		const s = (now.getTime() - date.getTime()) / 1000;
		if (s < 60) return strings.now;
		if (s < 3600) return `${parseInt(s / 60)} ${strings.minutes}`;
		if (s <= 86400) return `${parseInt(s / 3600)} ${strings.hours}`;
		const day = parseInt(s / 86400);
		if (day <= 7) return `${day} ${strings.days}`;
		if (day <= 30) return `${parseInt(day / 7)} ${strings.weeks}`;
		if (day <= 365) return `${parseInt(day / 30)} ${strings.months}`;
		return `${parseInt(day / 365)} ${strings.years}`;
	};

    const HistoryPlate = ({ vehicle, ts, active }) => (
		<TouchableOpacity activeOpacity={0.75} style={styles.historyItem}>
			<View style={[styles.historyIconWrap, { backgroundColor: active ? '#eafaf1' : '#fff4e5' }]}>
				<MaterialCommunityIcons
					name={active ? 'check-circle' : 'close-circle'}
					size={resize(20)}
					color={active ? green : orange}
				/>
			</View>
			<View style={{ flex: 1 }}>
				<CustomTextMedium style={styles.historyPlate}>{vehicle}</CustomTextMedium>
				<CustomTextRegular style={styles.historyTime}>{timeAgo(ts * 1000)}</CustomTextRegular>
			</View>
			<MaterialIcons name="chevron-right" size={resize(18)} color={gray} />
		</TouchableOpacity>
	);

    return (
        <View style={styles.container}>
            <Stack.Screen
                options={{
                    headerStyle: { backgroundColor: lightOrange },
                    headerTintColor: purple,
                    headerTitle: strings.title,
                    statusBarColor: lightOrange,
                    statusBarStyle: 'dark',
                }}
            />

            {/* Camera Card */}
            <View style={styles.cameraCard}>
                {permission?.granted ? (
                    <>
                        <CameraView
                            style={StyleSheet.absoluteFill}
                            facing='back'
                            ref={cameraRef}
                            onCameraReady={cameraReady}
                            animateShutter={shutter}
                            mute={true}
                            videoQuality='720p'
                        />
                        {/* Bottom controls overlay */}
                        <View style={styles.cameraControls}>
                            <View style={styles.recordingIndicator}>
                                {play && (
                                    <View style={[styles.recordDot, { backgroundColor: connected ? green : orange }]} />
                                )}
                            </View>
                            <View style={styles.controlButtons}>
                                <TouchableOpacity
                                    disabled={!ready}
                                    style={[styles.controlBtn, play && styles.controlBtnActive]}
                                    onPress={() => setPlay(!play)}
                                >
                                    {ready
                                        ? <FontAwesome6 name={!play ? 'play' : 'pause'} size={resize(18)} color={white} />
                                        : <ActivityIndicator size='small' color={white} />
                                    }
                                </TouchableOpacity>
                                <TouchableOpacity
                                    disabled={!ready}
                                    style={[styles.controlBtn, shutter && styles.controlBtnShutter]}
                                    onPress={() => setShutter(!shutter)}
                                >
                                    {ready
                                        ? <MaterialIcons name='shutter-speed' size={resize(20)} color={white} />
                                        : <ActivityIndicator size='small' color={white} />
                                    }
                                </TouchableOpacity>
                            </View>
                        </View>
                    </>
                ) : (
                    <View style={styles.permissionView}>
                        <MaterialCommunityIcons name="camera-off" size={resize(40)} color={gray} />
                        <CustomTextMedium style={styles.permissionText}>{strings.permission}</CustomTextMedium>
                        <TouchableOpacity onPress={requestPermission} style={styles.permissionBtn}>
                            <CustomTextMedium style={styles.permissionBtnText}>{strings.request}</CustomTextMedium>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {/* History Section */}
            <View style={styles.historySection}>
                <View style={styles.historyHeader}>
                    <MaterialIcons name="history" size={resize(20)} color={orange} />
                    <CustomTextMedium style={styles.historyHeaderText}>{strings.history}</CustomTextMedium>
                </View>
                <FlashList
                    data={history}
                    renderItem={({ item }) => <HistoryPlate {...item} />}
                    estimatedItemSize={resize(52)}
                />
            </View>
        </View>
    );
}

export default Index;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: lightOrange,
        alignItems: 'center',
        justifyContent: 'flex-start',
    },
    /* Camera */
    cameraCard: {
        flex: 1,
        width: '90%',
        marginTop: resize(16),
        marginBottom: resize(12),
        borderRadius: resize(18),
        overflow: 'hidden',
        backgroundColor: black,
        ...general.shaddowLighter,
    },
    cameraControls: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingHorizontal: resize(16),
        paddingVertical: resize(12),
        backgroundColor: 'rgba(0,0,0,0.40)',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    recordingIndicator: {
        width: resize(14),
        alignItems: 'center',
    },
    recordDot: {
        width: resize(10),
        height: resize(10),
        borderRadius: resize(5),
    },
    controlButtons: {
        flexDirection: 'row',
        gap: resize(10),
    },
    controlBtn: {
        width: resize(42),
        height: resize(42),
        borderRadius: resize(12),
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(137,3,80,0.80)',
    },
    controlBtnActive: {
        backgroundColor: 'rgba(86,194,17,0.85)',
    },
    controlBtnShutter: {
        backgroundColor: 'rgba(243,135,19,0.85)',
    },
    /* Permission */
    permissionView: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: resize(12),
        paddingHorizontal: resize(24),
    },
    permissionText: {
        ...general.fontSize10,
        color: gray,
        textAlign: 'center',
    },
    permissionBtn: {
        backgroundColor: purple,
        paddingHorizontal: resize(20),
        paddingVertical: resize(10),
        borderRadius: resize(12),
        marginTop: resize(4),
    },
    permissionBtnText: {
        ...general.fontSize8,
        color: white,
    },
    /* History */
    historySection: {
        flexBasis: resize(280),
        flexShrink: 1,
        width: '100%',
        backgroundColor: white,
        borderTopLeftRadius: resize(22),
        borderTopRightRadius: resize(22),
        overflow: 'hidden',
        ...general.shaddowLight,
    },
    historyHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: resize(8),
        backgroundColor: purple,
        paddingVertical: resize(10),
        paddingHorizontal: resize(16),
    },
    historyHeaderText: {
        ...general.fontSize8,
        color: white,
    },
    historyItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: resize(14),
        paddingVertical: resize(10),
        gap: resize(12),
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: lightGray,
    },
    historyIconWrap: {
        width: resize(36),
        height: resize(36),
        borderRadius: resize(10),
        alignItems: 'center',
        justifyContent: 'center',
    },
    historyPlate: {
        ...general.fontSize10,
        color: black,
    },
    historyTime: {
        ...general.fontSize6,
        color: gray,
        marginTop: resize(2),
    },
});

