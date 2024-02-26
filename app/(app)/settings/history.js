import { Stack } from 'expo-router';
import React, { useState } from 'react';
import {View, StyleSheet, TouchableOpacity, Pressable, ScrollView} from 'react-native';
import { CustomTextBold, CustomTextMedium, CustomTextRegular } from '../../../util/CustomText';
import { useSession } from '../../../context/userContext';
import { useMessage } from '../../../util/messages';
import { Entypo, Octicons } from '@expo/vector-icons';
import { black, gray, green, lightOrange, white } from '../../../util/colors';
import { resize, standardMin, general } from '../../../util/style';


export default History = () => {
    const { HistoryScreen: strings } = useMessage();
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

