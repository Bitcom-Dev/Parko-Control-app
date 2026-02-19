import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useState } from 'react';
import {View, StyleSheet, TouchableOpacity, Pressable, ScrollView, ActivityIndicator} from 'react-native';
import { CustomTextBold, CustomTextMedium, CustomTextRegular } from '../../../util/CustomText';
import { useAuth, useSession } from '../../../context/userContext';
import { useMessage } from '../../../util/messages';
import { AntDesign } from '@expo/vector-icons';
import { black, gray, green, lightOrange, purple, red, white } from '../../../util/colors';
import { resize, standardMin, general } from '../../../util/style';
import { FlashList } from "@shopify/flash-list";
import { controlInstance } from '../../../util/instances';

const History = () => {
    const { HistoryScreen: strings } = useMessage();
    const [DATA, setDATA] = useState([]);
    const [loading, setLoading] = useState(false);
    const auth = useAuth();
    const router = useRouter();
    const Verification = (props) => {
        const timestampToString = (ts) => {
            const date = new Date(ts);
          
            const year = date.getFullYear();
            const month = ('0' + (date.getMonth() + 1)).slice(-2); // Months are 0-based in JavaScript
            const day = ('0' + date.getDate()).slice(-2);
            const hours = ('0' + date.getHours()).slice(-2);
            const minutes = ('0' + date.getMinutes()).slice(-2);
          
            const dateString = `${hours}:${minutes} ${day}-${month}-${year} `;
          
            return dateString;
          }

        return (
            <TouchableOpacity style={{flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', gap: resize(10), paddingVertical: resize(10)}} activeOpacity={.7} onPress={() => router.push({pathname: "/", params: {vehicleSelected: props.vehicle, tsSelected: props.ts , details: JSON.stringify({...props.details, active: props.active})}})}>
                <View style={{flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: white, width: '90%', paddingVertical: resize(10), paddingHorizontal: resize(20), borderRadius: resize(15), gap: resize(5)}}>
                    <View style={{flexDirection: 'row',alignItems: 'center', justifyContent: 'space-between', width: '100%'}}>
                        <CustomTextMedium style={{...general.fontSize14}}>
                            {props.vehicle}
                        </CustomTextMedium>
                        <AntDesign name={props.active ? "checkcircle" : "closecircle"} size={resize(35)} color={props.active ? green : red} />
                    </View>
                    <CustomTextRegular style={{...general.fontSize10, alignSelf: 'flex-end'}}>
                        {timestampToString(props.ts * 1000)}
                    </CustomTextRegular>
                </View>
            </TouchableOpacity>
        );
    };
    const loadData = () => {
        if (loading)
            return;
        setLoading(true);
        controlInstance(auth).get('/history', {params: {offset: DATA.length}})
        .then(response => {
            setDATA(DATA.concat(response.data));
        })
        .catch(error => {
            console.log(error);
        })
        .finally(() => {
            setLoading(false);
        });
    }
    useEffect(() => {
      loadData();
    }, [])
    
    return (
        <ScrollView contentContainerStyle={{ flex: 1 }}>
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
            <FlashList
                data={DATA}
                renderItem={({ item }) => <Verification {...item} />}
                estimatedItemSize={resize(100)}
                onEndReached={loadData}
                onEndReachedThreshold={.1}
                ListFooterComponent={loading ? <ActivityIndicator size="large" color={purple} /> : null}
            />
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

export default History;