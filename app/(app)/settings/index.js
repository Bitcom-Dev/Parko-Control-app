import {View, StyleSheet, Text, SafeAreaView, ScrollView, TouchableOpacity} from 'react-native';
import { CustomTextMedium, CustomTextRegular } from '../../../util/CustomText';
import { resize, general } from '../../../util/style';
import { gray, purple } from '../../../util/colors';
import { MaterialIcons, Feather } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useMessage } from '../../../util/messages';
import { useSession } from '../../../context/userContext';

export default Index = () => {
    const { SettingsScreen: strings } = useMessage();
    const { signOut, user } = useSession();
    return (
        <ScrollView contentContainerStyle={{alignItems: 'center'}}>
            <View style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', width: '90%', gap: resize(20), marginVertical: resize(15) }}>
                <Feather name="user" size={resize(80)} color={purple} style={{borderColor: purple, borderWidth: resize(2), borderRadius: resize(15), paddingLeft: resize(5)}}/>
                <View>
                    <CustomTextMedium style={{...general.fontSize16}}>
                        {user.fullName}
                    </CustomTextMedium>
                    <CustomTextRegular style={{...general.fontSize12}}>
                        {user.username}
                    </CustomTextRegular>
                </View>
            </View>
            <Link href={"/settings/history"} asChild>
                <TouchableOpacity style={{width: "85%", justifyContent: 'flex-start', alignItems: 'center', paddingTop: resize(20), paddingBottom: resize(5), borderBottomColor: gray, borderBottomWidth: resize(2), flexDirection: 'row', gap: resize(10), paddingHorizontal: resize(10)}}>
                    <MaterialIcons name="history" size={resize(30)} color={purple} />
                    <CustomTextMedium style={{...general.fontSize14}}>
                        {strings.history}
                    </CustomTextMedium>
                </TouchableOpacity>
            </Link>

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

