import {View, StyleSheet, Text, SafeAreaView, ScrollView, TouchableOpacity} from 'react-native';
import { CustomTextMedium } from '../../../util/CustomText';
import { resize, general } from '../../../util/style';
import { gray, purple } from '../../../util/colors';
import { MaterialIcons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useMessage } from '../../../util/messages';
import { useSession } from '../../../context/userContext';

export default Index = () => {
    const { SettingsScreen: strings } = useMessage();
    const { signOut } = useSession();
    return (
        <ScrollView contentContainerStyle={{alignItems: 'center'}}>
            <Link href={"/settings/language"} asChild>
                <TouchableOpacity style={{width: "85%", justifyContent: 'flex-start', alignItems: 'center', paddingTop: resize(20), paddingBottom: resize(5), borderBottomColor: gray, borderBottomWidth: resize(2), flexDirection: 'row', gap: resize(10), paddingHorizontal: resize(10)}}>
                    <MaterialIcons name="language" size={resize(30)} color={purple} />
                    <CustomTextMedium style={{...general.fontSize14}}>
                        {strings.language}
                    </CustomTextMedium>
                </TouchableOpacity>
            </Link>

            <TouchableOpacity onPress={signOut} style={{width: "85%", justifyContent: 'flex-start', alignItems: 'center', paddingTop: resize(20), paddingBottom: resize(5), borderBottomColor: gray, borderBottomWidth: resize(0), flexDirection: 'row', gap: resize(10), paddingHorizontal: resize(10)}}>
                <MaterialIcons name="logout" size={resize(30)} color={purple} />
                <CustomTextMedium style={{...general.fontSize14}}>
                    {strings.logout}
                </CustomTextMedium>
            </TouchableOpacity>
        </ScrollView>
    );
}

const styles = StyleSheet.create({})

