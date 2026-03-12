import { Stack } from 'expo-router';
import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { CustomTextBold, CustomTextMedium, CustomTextRegular } from '../../../util/CustomText';
import { useSession } from '../../../context/userContext';
import { useMessage } from '../../../util/messages';
import { MaterialIcons } from '@expo/vector-icons';
import { black, gray, lightGray, lightOrange, purple, white } from '../../../util/colors';
import { resize, general } from '../../../util/style';

const LANGUAGES = [
    { code: 'en', label: 'English', flag: '🇬🇧' },
    { code: 'ro', label: 'Română', flag: '🇷🇴' },
];

const Language = () => {
    const { language, setLanguage } = useSession();
    const { LanguageScreen: strings } = useMessage();

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
            <Stack.Screen
                options={{
                    title: strings.main,
                    headerStyle: { backgroundColor: lightOrange },
                    headerTintColor: black,
                    statusBarColor: lightOrange,
                    statusBarStyle: 'dark',
                }}
            />

            <View style={styles.heroCard}>
                <View style={styles.heroDecorPrimary} />
                <View style={styles.heroDecorSecondary} />
                <View style={styles.heroBadge}>
                    <MaterialIcons name="language" size={resize(16)} color={white} />
                    <CustomTextMedium style={styles.heroBadgeText}>{strings.main}</CustomTextMedium>
                </View>
                <CustomTextBold style={styles.heroTitle}>{strings.main}</CustomTextBold>
                <CustomTextRegular style={styles.heroSubtitle}>{strings.desc}</CustomTextRegular>
            </View>

            <CustomTextBold style={styles.sectionTitle}>{strings.title}</CustomTextBold>

            <View style={styles.langCard}>
                {LANGUAGES.map((lang, index) => {
                    const selected = language === lang.code;
                    return (
                        <TouchableOpacity
                            key={lang.code}
                            style={[
                                styles.langItem,
                                selected && styles.langItemSelected,
                                index !== LANGUAGES.length - 1 && styles.langItemBorder,
                            ]}
                            activeOpacity={0.75}
                            onPress={() => setLanguage(lang.code)}
                        >
                            <View style={styles.langIconWrap}>
                                <CustomTextBold style={styles.langFlag}>{lang.flag}</CustomTextBold>
                            </View>
                            <CustomTextMedium style={[styles.langLabel, selected && styles.langLabelSelected]}>
                                {lang.label}
                            </CustomTextMedium>
                            <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
                                {selected && <View style={styles.radioInner} />}
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </ScrollView>
    );
};

export default Language;

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: lightOrange,
    },
    contentContainer: {
        paddingHorizontal: resize(16),
        paddingTop: resize(16),
        paddingBottom: resize(36),
    },
    heroCard: {
        backgroundColor: purple,
        borderRadius: resize(24),
        padding: resize(20),
        overflow: 'hidden',
        marginBottom: resize(22),
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
    sectionTitle: {
        ...general.fontSize8,
        color: gray,
        textTransform: 'uppercase',
        letterSpacing: 1.2,
        marginBottom: resize(10),
        paddingHorizontal: resize(4),
    },
    langCard: {
        backgroundColor: white,
        borderRadius: resize(18),
        overflow: 'hidden',
        ...general.shaddowLighter,
    },
    langItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: resize(16),
        paddingVertical: resize(16),
        gap: resize(14),
    },
    langItemSelected: {
        backgroundColor: purple + '08',
    },
    langItemBorder: {
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: lightGray,
    },
    langIconWrap: {
        width: resize(44),
        height: resize(44),
        borderRadius: resize(14),
        backgroundColor: '#f6f6f6',
        alignItems: 'center',
        justifyContent: 'center',
    },
    langFlag: {
        fontSize: resize(24),
    },
    langLabel: {
        flex: 1,
        ...general.fontSize10,
        color: black,
    },
    langLabelSelected: {
        color: purple,
    },
    radioOuter: {
        width: resize(22),
        height: resize(22),
        borderRadius: resize(11),
        borderWidth: 2,
        borderColor: lightGray,
        alignItems: 'center',
        justifyContent: 'center',
    },
    radioOuterSelected: {
        borderColor: purple,
    },
    radioInner: {
        width: resize(11),
        height: resize(11),
        borderRadius: resize(6),
        backgroundColor: purple,
    },
});

