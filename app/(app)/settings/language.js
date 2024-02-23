import { Stack } from 'expo-router';
import React, { useState } from 'react';
import {View, StyleSheet, TouchableOpacity, Pressable, ScrollView} from 'react-native';
import { CustomTextBold, CustomTextMedium, CustomTextRegular } from '../../../util/CustomText';
import { useSession } from '../../../context/userContext';
import { useMessage } from '../../../util/messages';
import { Entypo, Octicons } from '@expo/vector-icons';
import { black, gray, green, lightOrange, white } from '../../../util/colors';
import { resize, standardMin, general } from '../../../util/style';

const Checkbox = ({style, value, onPress}) => {
    return (
        <Pressable style={style} onPress={onPress}>
            <Entypo name="circle" size={parseInt(standardMin / 500 * 10) + 10} color={value ? green : gray} />
            {value && <Octicons style={{position: 'absolute', alignSelf:'center'}} name="dot-fill" size={parseInt(standardMin / 500 * 10) + 10} color={green} /> }
        </Pressable>
    )
}


export default Language = () => {
    const {language, setLanguage} = useSession();
    const [english, setEnglish] = useState(language === 'en' ? true : false);
    const [romanian, setRomanian] = useState(language === 'ro' ? true : false);
    const { LanguageScreen: strings } = useMessage();
    return (
        <ScrollView>
            <Stack.Screen 
                options={{
                    title: "",
                    headerStyle: {
                        backgroundColor: white,
                    },
                    headerTintColor: black,
                    statusBarColor: white,
                    statusBarStyle: 'dark'
                }}
            />
            <View style={styles.yellow}>
                <CustomTextMedium style={styles.mainText}>{strings.main}</CustomTextMedium>
                <CustomTextBold style={styles.descriptionText}>{strings.desc}</CustomTextBold>
            </View>
            <CustomTextRegular style={styles.title}>{strings.title}</CustomTextRegular>
            <TouchableOpacity onPress={() => {setRomanian(false);setEnglish(true);setLanguage('en');}} style={styles.lang}>
                <Checkbox style={styles.checkbox} value={english} onPress={() => {setRomanian(false);setEnglish(true);setLanguage('en');}} />
                <CustomTextRegular style={styles.langText}>English</CustomTextRegular>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {setRomanian(true);setEnglish(false);setLanguage('ro');}} style={styles.lang}>
                <Checkbox style={styles.checkbox} value={romanian} onPress={() => {setRomanian(true);setEnglish(false);setLanguage('ro');}} />
                <CustomTextRegular style={styles.langText}>Română</CustomTextRegular>
            </TouchableOpacity>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    yellow: {
        backgroundColor: lightOrange,
        paddingTop: 50,    
        paddingHorizontal: 20,    
        paddingBottom: 50,  
        shadowColor: black,
        shadowOffset: {
            width: 0,
            height: 8,
        },
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
        marginLeft: 10
    },
    lang: {
        flexDirection: 'row',
        paddingLeft: resize(30),
        alignItems: 'center',
        paddingVertical: resize(15)
    },
    scroll: {
        flex: 1,
    },
    checkbox: {
        flex:1,
        alignItems: 'center',
        justifyContent: 'center'
    },
    langText: {
        flexGrow: 4,
        ...general.fontSize12,
    },
    title: {
        ...general.fontSize14,
        color: gray,
        fontWeight: 'bold',
        paddingTop: 30,
        paddingBottom: 15,
        paddingLeft: 50,
    }
})

