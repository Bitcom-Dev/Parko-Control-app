import { View, StyleSheet, ScrollView, TouchableOpacity, Platform } from 'react-native';
import { useMemo } from 'react';
import Constants from 'expo-constants';
import { CustomTextBold, CustomTextMedium, CustomTextRegular } from '../../../util/CustomText';
import { resize, general } from '../../../util/style';
import { black, gray, lightGray, lightOrange, orange, purple, white } from '../../../util/colors';
import { MaterialIcons, Feather } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useMessage } from '../../../util/messages';
import { useSession } from '../../../context/userContext';

const IndexSettings = () => {
    const { SettingsScreen: strings } = useMessage();
    const { signOut, user } = useSession();

    const initials = useMemo(() => {
        const source = user?.fullName || user?.username || '';
        const parts = String(source)
            .trim()
            .split(/\s+/)
            .filter(Boolean)
            .slice(0, 2);

        if (!parts.length) return 'PC';
        return parts.map((part) => part.charAt(0).toUpperCase()).join('');
    }, [user?.fullName, user?.username]);

    const settingsItems = useMemo(() => ([
        {
            href: '/settings/history',
            icon: 'history',
            title: strings.history,
            subtitle: strings.historySubtitle,
            iconBg: '#f0e6f0',
            iconColor: purple,
        },
        {
            href: '/settings/print-history-select',
            icon: 'print',
            title: strings.printHistory,
            subtitle: strings.printHistorySubtitle,
            iconBg: '#fff4e5',
            iconColor: orange,
        },
        {
            href: '/settings/language',
            icon: 'language',
            title: strings.language,
            subtitle: strings.languageSubtitle,
            iconBg: '#eaf3ff',
            iconColor: '#3a7bd5',
        },
    ]), [strings.history, strings.historySubtitle, strings.language, strings.languageSubtitle, strings.printHistory, strings.printHistorySubtitle]);

    return (
        <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
            <View style={styles.heroCard}>
                <View style={styles.heroDecorPrimary} />
                <View style={styles.heroDecorSecondary} />

                <View style={styles.heroHeader}>
                    <View style={styles.heroBadge}>
                        <MaterialIcons name="settings" size={resize(16)} color={white} />
                        <CustomTextMedium style={styles.heroBadgeText}>{strings.title}</CustomTextMedium>
                    </View>
                </View>

                <View style={styles.profileRow}>
                    <View style={styles.avatarWrap}>
                        <CustomTextBold style={styles.avatarText}>{initials}</CustomTextBold>
                    </View>

                    <View style={styles.profileInfo}>
                        <CustomTextBold style={styles.profileName}>
                            {user?.fullName || strings.userFallback}
                        </CustomTextBold>
                        <CustomTextRegular style={styles.profileUsername}>
                            @{user?.username || 'parkocontrol'}
                        </CustomTextRegular>
                        <CustomTextRegular style={styles.profileHint}>
                            {strings.profileHint}
                        </CustomTextRegular>
                    </View>
                </View>

                <View style={styles.infoPillsRow}>
                    <View style={styles.infoPill}>
                        <Feather name="user" size={resize(14)} color={purple} />
                        <CustomTextMedium style={styles.infoPillText}>
                            {user?.username || strings.activeAccount}
                        </CustomTextMedium>
                    </View>
                    <View style={styles.infoPill}>
                        <MaterialIcons name="verified-user" size={resize(14)} color={purple} />
                        <CustomTextMedium style={styles.infoPillText}>
                            {Array.isArray(user?.modules) ? `${user.modules.length} ${strings.modules}` : strings.secureAccess}
                        </CustomTextMedium>
                    </View>
                </View>
            </View>

            <View style={styles.sectionWrap}>
                <CustomTextBold style={styles.sectionTitle}>{strings.preferences}</CustomTextBold>

                <View style={styles.menuCard}>
                    {settingsItems.map((item, index) => (
                        <Link key={item.href} href={item.href} asChild>
                            <TouchableOpacity
                                style={styles.menuItem}
                                activeOpacity={0.75}
                            >
                                <View style={[styles.menuItemIconWrap, { backgroundColor: item.iconBg }]}>
                                    <MaterialIcons name={item.icon} size={resize(22)} color={item.iconColor} />
                                </View>

                                <View style={styles.menuItemTextWrap}>
                                    <CustomTextMedium style={styles.menuItemTitle}>
                                        {item.title}
                                    </CustomTextMedium>
                                    <CustomTextRegular style={styles.menuItemSubtitle}>
                                        {item.subtitle}
                                    </CustomTextRegular>
                                </View>

                                <MaterialIcons name="chevron-right" size={resize(22)} color={gray} />
                            </TouchableOpacity>
                        </Link>
                    ))}
                </View>
            </View>

            <View style={styles.logoutSection}>
                <TouchableOpacity onPress={signOut} style={styles.logoutButton} activeOpacity={0.86}>
                    <View style={styles.logoutIconWrap}>
                        <MaterialIcons name="logout" size={resize(22)} color={orange} />
                    </View>
                    <View style={styles.logoutTextWrap}>
                        <CustomTextMedium style={styles.logoutTitle}>
                            {strings.logout}
                        </CustomTextMedium>
                        <CustomTextRegular style={styles.logoutSubtitle}>
                            {strings.logoutSubtitle}
                        </CustomTextRegular>
                    </View>
                </TouchableOpacity>
            </View>
            <View style={styles.debugCard}>
                <View style={styles.debugRow}>
                    <MaterialIcons name="info-outline" size={resize(13)} color={gray} />
                    <CustomTextRegular style={styles.debugLabel}>Version</CustomTextRegular>
                    <CustomTextMedium style={styles.debugValue}>
                        {Constants.expoConfig?.version ?? '—'}
                    </CustomTextMedium>
                </View>
                <View style={styles.debugDivider} />
                <View style={styles.debugRow}>
                    <MaterialIcons name="phone-android" size={resize(13)} color={gray} />
                    <CustomTextRegular style={styles.debugLabel}>Platform</CustomTextRegular>
                    <CustomTextMedium style={styles.debugValue}>
                        {Platform.OS} {Platform.Version}
                    </CustomTextMedium>
                </View>
            </View>
        </ScrollView>
    );
};

export default IndexSettings;

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
        padding: resize(18),
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
    heroHeader: {
        flexDirection: 'row',
        justifyContent: 'flex-start',
        marginBottom: resize(18),
    },
    heroBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: resize(6),
        backgroundColor: 'rgba(255,255,255,0.15)',
        paddingHorizontal: resize(10),
        paddingVertical: resize(7),
        borderRadius: resize(999),
    },
    heroBadgeText: {
        ...general.fontSize6,
        color: white,
    },
    profileRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: resize(14),
    },
    avatarWrap: {
        width: resize(72),
        height: resize(72),
        borderRadius: resize(22),
        backgroundColor: white,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 3,
        borderColor: 'rgba(255,255,255,0.18)',
    },
    avatarText: {
        ...general.fontSize14,
        color: purple,
    },
    profileInfo: {
        flex: 1,
    },
    profileName: {
        ...general.fontSize12,
        color: white,
    },
    profileUsername: {
        ...general.fontSize6,
        color: 'rgba(255,255,255,0.85)',
        marginTop: resize(2),
    },
    profileHint: {
        ...general.fontSize6,
        color: 'rgba(255,255,255,0.75)',
        marginTop: resize(8),
        lineHeight: resize(18),
    },
    infoPillsRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: resize(10),
        marginTop: resize(18),
    },
    infoPill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: resize(6),
        backgroundColor: white,
        borderRadius: resize(999),
        paddingHorizontal: resize(12),
        paddingVertical: resize(9),
    },
    infoPillText: {
        ...general.fontSize6,
        color: purple,
    },
    sectionWrap: {
        marginTop: resize(22),
    },
    sectionTitle: {
        ...general.fontSize8,
        color: gray,
        textTransform: 'uppercase',
        letterSpacing: 1.2,
        marginBottom: resize(8),
        paddingHorizontal: resize(6),
    },
    menuCard: {
        backgroundColor: white,
        borderRadius: resize(18),
        overflow: 'hidden',
        ...general.shaddowLighter,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: resize(16),
        paddingVertical: resize(14),
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: lightGray,
    },
    menuItemIconWrap: {
        width: resize(40),
        height: resize(40),
        borderRadius: resize(12),
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: resize(14),
    },
    menuItemTextWrap: {
        flex: 1,
    },
    menuItemTitle: {
        ...general.fontSize8,
        color: black,
    },
    menuItemSubtitle: {
        ...general.fontSize6,
        color: gray,
        marginTop: resize(2),
        lineHeight: resize(17),
    },
    logoutSection: {
        marginTop: resize(18),
    },
    logoutButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: white,
        borderRadius: resize(20),
        paddingHorizontal: resize(14),
        paddingVertical: resize(15),
        borderWidth: 1,
        borderColor: '#f5d2b1',
        ...general.shaddowLighter,
    },
    logoutIconWrap: {
        width: resize(46),
        height: resize(46),
        borderRadius: resize(14),
        backgroundColor: '#fff5ec',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: resize(12),
    },
    logoutTextWrap: {
        flex: 1,
    },
    logoutTitle: {
        ...general.fontSize8,
        color: orange,
    },
    logoutSubtitle: {
        ...general.fontSize6,
        color: gray,
        marginTop: resize(3),
    },
    debugCard: {
        marginTop: resize(14),
        backgroundColor: white,
        borderRadius: resize(16),
        paddingHorizontal: resize(16),
        paddingVertical: resize(4),
        ...general.shaddowLighter,
    },
    debugRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: resize(8),
        paddingVertical: resize(11),
    },
    debugLabel: {
        ...general.fontSize6,
        color: gray,
        flex: 1,
    },
    debugValue: {
        ...general.fontSize6,
        color: black,
    },
    debugDivider: {
        height: StyleSheet.hairlineWidth,
        backgroundColor: lightGray,
        marginHorizontal: resize(-16),
    },
});

