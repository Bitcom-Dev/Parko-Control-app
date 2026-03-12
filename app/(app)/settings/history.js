import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList } from 'react-native';
import { CustomTextBold, CustomTextMedium, CustomTextRegular } from '../../../util/CustomText';
import { useAuth } from '../../../context/userContext';
import { useMessage } from '../../../util/messages';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';
import { black, gray, green, lightGray, lightOrange, purple, red, white } from '../../../util/colors';
import { resize, general } from '../../../util/style';
import { controlInstance } from '../../../util/instances';

const timestampToString = (ts) => {
    const date = new Date(ts);
    const year = date.getFullYear();
    const month = ('0' + (date.getMonth() + 1)).slice(-2);
    const day = ('0' + date.getDate()).slice(-2);
    const hours = ('0' + date.getHours()).slice(-2);
    const minutes = ('0' + date.getMinutes()).slice(-2);
    return `${hours}:${minutes}  ${day}-${month}-${year}`;
};

const Verification = ({ vehicle, ts, active, details, onPress }) => (
    <TouchableOpacity style={styles.itemWrap} activeOpacity={0.75} onPress={onPress}>
        <View style={[styles.itemIconWrap, { backgroundColor: active ? '#eafaf1' : '#fdf0ee' }]}>
            <MaterialCommunityIcons
                name={active ? 'check-circle' : 'close-circle'}
                size={resize(24)}
                color={active ? green : red}
            />
        </View>
        <View style={styles.itemTextWrap}>
            <CustomTextMedium style={styles.itemTitle}>{vehicle}</CustomTextMedium>
            <CustomTextRegular style={styles.itemSubtitle}>
                {timestampToString(ts * 1000)}
            </CustomTextRegular>
        </View>
        <MaterialIcons name="chevron-right" size={resize(22)} color={gray} />
    </TouchableOpacity>
);

const History = () => {
    const { HistoryScreen: strings } = useMessage();
    const [DATA, setDATA] = useState([]);
    const [loading, setLoading] = useState(false);
    const auth = useAuth();
    const router = useRouter();

    const loadData = () => {
        if (loading) return;
        setLoading(true);
        controlInstance(auth).get('/history', { params: { offset: DATA.length } })
            .then(response => { setDATA(prev => prev.concat(response.data)); })
            .catch(error => { console.log(error); })
            .finally(() => { setLoading(false); });
    };

    useEffect(() => { loadData(); }, []);

    return (
        <View style={styles.container}>
            <Stack.Screen
                options={{
                    title: strings.main,
                    headerStyle: { backgroundColor: lightOrange },
                    headerTintColor: black,
                    statusBarColor: lightOrange,
                    statusBarStyle: 'dark',
                }}
            />

            <FlatList
                data={DATA}
                keyExtractor={(item, i) => `${i}_${item?.ts ?? i}`}
                renderItem={({ item }) => (
                    <Verification
                        {...item}
                        onPress={() => router.push({
                            pathname: '/',
                            params: {
                                vehicleSelected: item.vehicle,
                                tsSelected: item.ts,
                                details: JSON.stringify({ ...item.details, active: item.active }),
                            },
                        })}
                    />
                )}
                ItemSeparatorComponent={() => <View style={{ height: resize(10) }} />}
                onEndReached={loadData}
                onEndReachedThreshold={0.1}
                ListHeaderComponent={
                    <View style={styles.heroCard}>
                        <View style={styles.heroDecorPrimary} />
                        <View style={styles.heroDecorSecondary} />
                        <View style={styles.heroBadge}>
                            <MaterialIcons name="history" size={resize(16)} color={white} />
                            <CustomTextMedium style={styles.heroBadgeText}>{strings.main}</CustomTextMedium>
                        </View>
                        <CustomTextBold style={styles.heroTitle}>{strings.main}</CustomTextBold>
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
                        <MaterialIcons name="history" size={resize(48)} color={lightGray} />
                        <CustomTextRegular style={styles.emptyText}>{strings.desc}</CustomTextRegular>
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

export default History;