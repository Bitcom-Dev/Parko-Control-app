import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { CustomTextBold, CustomTextMedium, CustomTextRegular } from '../../../util/CustomText';
import { useAuth } from '../../../context/userContext';
import { useMessage } from '../../../util/messages';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { black, gray, green, lightOrange, purple, red, white } from '../../../util/colors';
import { resize, general } from '../../../util/style';
import { FlashList } from '@shopify/flash-list';
import { notaConstatareInstance } from '../../../util/instances';
import { setPrintPreview } from '../../../util/printPreviewStore';

const LIMIT = 20;

const PrintHistory = () => {
    const { PrintHistoryScreen: strings } = useMessage();
    const [DATA, setDATA] = useState([]);
    const [loading, setLoading] = useState(false);
    const [total, setTotal] = useState(null);
    const [loadingItem, setLoadingItem] = useState(null);
    const auth = useAuth();
    const router = useRouter();

    const openPrint = (ID) => {
        if (loadingItem !== null) return;
        setLoadingItem(ID);
        notaConstatareInstance(auth).get(`retrieve_print/${ID}`)
            .then(response => {
                setPrintPreview({
                    printed_id: ID,
                    printed_nota: String(response.data.file_content),
                    dots_printer: response.data.dots_printer ?? null,
                });
                router.push('/print-preview');
            })
            .catch(error => {
                console.log(error);
                Alert.alert('Eroare', 'Nu s-a putut incarca printarea.');
            })
            .finally(() => {
                setLoadingItem(null);
            });
    };

    const timestampToString = (ts) => {
        const date = new Date(ts * 1000);
        const year = date.getFullYear();
        const month = ('0' + (date.getMonth() + 1)).slice(-2);
        const day = ('0' + date.getDate()).slice(-2);
        const hours = ('0' + date.getHours()).slice(-2);
        const minutes = ('0' + date.getMinutes()).slice(-2);
        return `${hours}:${minutes} ${day}-${month}-${year}`;
    };

    const PrintItem = ({ ID, ts, license_plate, reported }) => (
        <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => openPrint(ID)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', paddingVertical: resize(10) }}
        >
            <View style={{ flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: white, width: '90%', paddingVertical: resize(10), paddingHorizontal: resize(20), borderRadius: resize(15), gap: resize(5) }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                    <CustomTextMedium style={{ ...general.fontSize14 }}>
                        {license_plate}
                    </CustomTextMedium>
                    {loadingItem === ID
                        ? <ActivityIndicator size="small" color={purple} />
                        : <MaterialCommunityIcons
                            name={reported ? 'check-circle' : 'close-circle'}
                            size={resize(35)}
                            color={reported ? green : red}
                          />
                    }
                </View>
                <CustomTextRegular style={{ ...general.fontSize10, alignSelf: 'flex-end' }}>
                    {timestampToString(ts)}
                </CustomTextRegular>
            </View>
        </TouchableOpacity>
    );

    const loadData = () => {
        if (loading) return;
        if (total !== null && DATA.length >= total) return;
        setLoading(true);
        const currentPage = Math.floor(DATA.length / LIMIT) + 1;
        notaConstatareInstance(auth).get(`history/${currentPage}/${LIMIT}`)
            .then(response => {
                setDATA(prev => prev.concat(response.data.history));
                setTotal(response.data.total);
            })
            .catch(error => {
                console.log(error);
            })
            .finally(() => {
                setLoading(false);
            });
    };

    useEffect(() => {
        loadData();
    }, []);

    return (
        <ScrollView contentContainerStyle={{ flex: 1 }}>
            <Stack.Screen
                options={{
                    title: '',
                    headerStyle: { backgroundColor: white },
                    headerTintColor: black,
                    statusBarColor: white,
                    statusBarStyle: 'dark',
                }}
            />
            <View style={styles.yellow}>
                <CustomTextMedium style={styles.mainText}>{strings.main}</CustomTextMedium>
                <CustomTextBold style={styles.descriptionText}>{strings.desc}</CustomTextBold>
            </View>
            <FlashList
                data={DATA}
                renderItem={({ item }) => <PrintItem {...item} />}
                estimatedItemSize={resize(100)}
                onEndReached={loadData}
                onEndReachedThreshold={0.1}
                ListFooterComponent={loading ? <ActivityIndicator size="large" color={purple} /> : null}
                ListEmptyComponent={
                    !loading ? (
                        <CustomTextRegular style={{ textAlign: 'center', marginTop: resize(30), ...general.fontSize12 }}>
                            {strings.noHistory}
                        </CustomTextRegular>
                    ) : null
                }
            />
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    yellow: {
        backgroundColor: lightOrange,
        paddingTop: 50,
        paddingHorizontal: 20,
        paddingBottom: 50,
        shadowColor: black,
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.44,
        shadowRadius: 10.32,
        elevation: 16,
    },
    mainText: {
        ...general.fontSize16,
    },
    descriptionText: {
        ...general.fontSize12,
        color: gray,
        marginLeft: 10,
    },
});

export default PrintHistory;
