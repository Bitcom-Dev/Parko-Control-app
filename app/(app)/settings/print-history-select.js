import { Stack, useRouter } from 'expo-router';
import React from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { CustomTextBold, CustomTextMedium, CustomTextRegular } from '../../../util/CustomText';
import { useSession } from '../../../context/userContext';
import { useMessage } from '../../../util/messages';
import { MaterialIcons } from '@expo/vector-icons';
import { black, gray, lightGray, lightOrange, orange, purple, white } from '../../../util/colors';
import { resize, general } from '../../../util/style';

const MODULE_CONFIGS = [
    {
        key: 'NOTA_CONSTATARE',
        icon: 'note-add',
        iconBg: '#fce4ec',
        iconColor: '#890350',
        titleKey: 'notaConstatare',
        descKey: 'notaConstatareDesc',
    },
    {
        key: 'PV',
        icon: 'gavel',
        iconBg: '#e3f2fd',
        iconColor: '#1565C0',
        titleKey: 'pv',
        descKey: 'pvDesc',
    },
];

const PrintHistorySelect = () => {
    const { PrintHistorySelectScreen: strings } = useMessage();
    const { user } = useSession();
    const router = useRouter();

    const userModules = user?.modules || [];
    const available = MODULE_CONFIGS.filter(m => userModules.includes(m.key));

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
            <ScrollView contentContainerStyle={styles.content}>
                <View style={styles.heroCard}>
                    <View style={styles.heroDecorPrimary} />
                    <View style={styles.heroDecorSecondary} />
                    <View style={styles.heroBadge}>
                        <MaterialIcons name="print" size={resize(16)} color={white} />
                        <CustomTextMedium style={styles.heroBadgeText}>{strings.main}</CustomTextMedium>
                    </View>
                    <CustomTextBold style={styles.heroTitle}>{strings.main}</CustomTextBold>
                    <CustomTextRegular style={styles.heroSubtitle}>{strings.desc}</CustomTextRegular>
                </View>

                {available.map(mod => (
                    <TouchableOpacity
                        key={mod.key}
                        style={styles.itemWrap}
                        activeOpacity={0.75}
                        onPress={() => router.push({ pathname: '/settings/print_history', params: { module: mod.key } })}
                    >
                        <View style={[styles.itemIconWrap, { backgroundColor: mod.iconBg }]}>
                            <MaterialIcons name={mod.icon} size={resize(24)} color={mod.iconColor} />
                        </View>
                        <View style={styles.itemTextWrap}>
                            <CustomTextMedium style={styles.itemTitle}>{strings[mod.titleKey]}</CustomTextMedium>
                            <CustomTextRegular style={styles.itemSubtitle}>{strings[mod.descKey]}</CustomTextRegular>
                        </View>
                        <MaterialIcons name="chevron-right" size={resize(22)} color={gray} />
                    </TouchableOpacity>
                ))}

                {available.length === 0 && (
                    <View style={styles.emptyWrap}>
                        <MaterialIcons name="print-disabled" size={resize(48)} color={lightGray} />
                        <CustomTextRegular style={styles.emptyText}>{strings.noModules}</CustomTextRegular>
                    </View>
                )}
            </ScrollView>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: lightOrange,
    },
    content: {
        paddingBottom: resize(36),
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
        marginTop: resize(10),
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

export default PrintHistorySelect;
