import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, FlatList } from 'react-native';
import { CustomTextBold, CustomTextMedium, CustomTextRegular } from '../../../util/CustomText';
import { useAuth } from '../../../context/userContext';
import { useMessage } from '../../../util/messages';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { black, gray, green, lightGray, lightOrange, orange, purple, red, white } from '../../../util/colors';
import { resize, general } from '../../../util/style';
import { notaConstatareInstance, pvInstance } from '../../../util/instances';
import { setPrintPreview } from '../../../util/printPreviewStore';

const LIMIT = 20;

const timestampToString = (ts) => {
    const date = new Date(ts * 1000);
    const year = date.getFullYear();
    const month = ('0' + (date.getMonth() + 1)).slice(-2);
    const day = ('0' + date.getDate()).slice(-2);
    const hours = ('0' + date.getHours()).slice(-2);
    const minutes = ('0' + date.getMinutes()).slice(-2);
    return `${hours}:${minutes}  ${day}-${month}-${year}`;
};

const PrintHistory = () => {
    const { module: moduleParam = 'NOTA_CONSTATARE' } = useLocalSearchParams();
    const { PrintHistoryScreen: strings, PrintHistorySelectScreen: selectStrings } = useMessage();
    const [DATA, setDATA] = useState([]);
    const [loading, setLoading] = useState(false);
    const [total, setTotal] = useState(null);
    const [loadingItem, setLoadingItem] = useState(null);
    const auth = useAuth();
    const router = useRouter();

    const getInstance = () => moduleParam === 'PV' ? pvInstance(auth) : notaConstatareInstance(auth);

    const getTitle = () => moduleParam === 'PV' ? selectStrings.pv : selectStrings.notaConstatare;

    const openPrint = (ID) => {
        if (loadingItem !== null) return;
        setLoadingItem(ID);
        getInstance().get(`retrieve_print/${ID}`)
            .then(response => {
                setPrintPreview({
                    printed_id: ID,
                    printed_nota: String(response.data.file_content),
                    dots_printer: response.data.dots_printer ?? null,
                });
                router.push('/print-preview');
            })
            .catch(() => { Alert.alert('Eroare', 'Nu s-a putut incarca printarea.'); })
            .finally(() => { setLoadingItem(null); });
    };

    const PrintItem = ({ ID, ts, license_plate, reported }) => (
        <TouchableOpacity style={styles.itemWrap} activeOpacity={0.75} onPress={() => openPrint(ID)}>
            <View style={[styles.itemIconWrap, { backgroundColor: reported ? '#eafaf1' : '#fff4e5' }]}>
                {loadingItem === ID
                    ? <ActivityIndicator size="small" color={purple} />
                    : <MaterialCommunityIcons
                        name={reported ? 'check-circle' : 'printer-alert'}
                        size={resize(24)}
                        color={reported ? green : orange}
                      />
                }
            </View>
            <View style={styles.itemTextWrap}>
                <CustomTextMedium style={styles.itemTitle}>{license_plate}</CustomTextMedium>
                <CustomTextRegular style={styles.itemSubtitle}>{timestampToString(ts)}</CustomTextRegular>
            </View>
            <MaterialIcons name="chevron-right" size={resize(22)} color={gray} />
        </TouchableOpacity>
    );

    const loadData = () => {
        if (loading) return;
        if (total !== null && DATA.length >= total) return;
        setLoading(true);
        const currentPage = Math.floor(DATA.length / LIMIT) + 1;
        getInstance().get(`history/${currentPage}/${LIMIT}`)
            .then(response => {
                setDATA(prev => prev.concat(response.data.history));
                setTotal(response.data.total);
            })
            .catch(error => { console.log(error); })
            .finally(() => { setLoading(false); });
    };

    useEffect(() => { loadData(); }, []);

    return (
        <View style={styles.container}>
            <Stack.Screen
                options={{
                    title: getTitle(),
                    headerStyle: { backgroundColor: lightOrange },
                    headerTintColor: black,
                    statusBarColor: lightOrange,
                    statusBarStyle: 'dark',
                }}
            />
            <FlatList
                data={DATA}
                keyExtractor={(item, i) => `${i}_${item?.ID ?? i}`}
                renderItem={({ item }) => <PrintItem {...item} />}
                ItemSeparatorComponent={() => <View style={{ height: resize(10) }} />}
                onEndReached={loadData}
                onEndReachedThreshold={0.1}
                ListHeaderComponent={
                    <View style={styles.heroCard}>
                        <View style={styles.heroDecorPrimary} />
                        <View style={styles.heroDecorSecondary} />
                        <View style={styles.heroBadge}>
                            <MaterialIcons name="print" size={resize(16)} color={white} />
                            <CustomTextMedium style={styles.heroBadgeText}>{getTitle()}</CustomTextMedium>
                        </View>
                        <CustomTextBold style={styles.heroTitle}>{getTitle()}</CustomTextBold>
                        <CustomTextRegular style={styles.heroSubtitle}>{strings.desc}</CustomTextRegular>
                    </View>
                }
                ListFooterComponent={loading ? (
                    <View style={{ paddingVertical: resize(20), alignItems: 'center' }}>
                        <ActivityIndicator size="large" color={purple} />
                    </View>
                ) : null}
                ListEmptyComponent={!loading ? (
                    <View style={styles.emptyWrap}>
                        <MaterialIcons name="print-disabled" size={resize(48)} color={lightGray} />
                        <CustomTextRegular style={styles.emptyText}>{strings.noHistory}</CustomTextRegular>
                    </View>
                ) : null}
                contentContainerStyle={{ paddingBottom: resize(36) }}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: lightOrange,
    },
    heroCard: {
        backgroundColor: purple,
        borderRadius: resize(24),
        margin: resize(16),
        marginBottom: resize(10),
        padding: resize(20),
        overflow: 'hidden',
        ...general.shaddowLight,
    },
    heroDecorPrimary: {
        position: 'absolute',
        width: resize(160),
        height: resize(160),
        borderRadius: resize(80),
        backgroundColor: 'rgba(255,255,255,0.08)',
        top: resize(-40),
        right: resize(-30),
    },
    heroDecorSecondary: {
        position: 'absolute',
        width: resize(110),
        height: resize(110),
        borderRadius: resize(55),
        backgroundColor: 'rgba(243,135,19,0.22)',
        bottom: resize(-30),
        left: resize(-20),
    },
    heroBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: resize(6),
        backgroundColor: 'rgba(255,255,255,0.15)',
        paddingHorizontal: resize(10),
        paddingVertical: resize(6),
        borderRadius: resize(999),
        marginBottom: resize(14),
    },
    heroBadgeText: {
        ...general.fontSize6,
        color: white,
    },
    heroTitle: {
        ...general.fontSize14,
        color: white,
        marginBottom: resize(6),
    },
    heroSubtitle: {
        ...general.fontSize6,
        color: 'rgba(255,255,255,0.80)',
        lineHeight: resize(18),
    },
    itemWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: white,
        borderRadius: resize(18),
        marginHorizontal: resize(16),
        paddingHorizontal: resize(14),
        paddingVertical: resize(14),
        ...general.shaddowLighter,
    },
    itemIconWrap: {
        width: resize(44),
        height: resize(44),
        borderRadius: resize(14),
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: resize(14),
    },
    itemTextWrap: {
        flex: 1,
    },
    itemTitle: {
        ...general.fontSize10,
        color: black,
    },
    itemSubtitle: {
        ...general.fontSize6,
        color: gray,
        marginTop: resize(3),
    },
    emptyWrap: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: resize(40),
        gap: resize(10),
    },
    emptyText: {
        ...general.fontSize8,
        color: gray,
        textAlign: 'center',
    },
});

export default PrintHistory;
