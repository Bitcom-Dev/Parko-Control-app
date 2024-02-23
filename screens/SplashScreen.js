import { View, Text, ActivityIndicator } from 'react-native'
import React from 'react'
import Logo from '../assets/Logo'
import { purple, white } from '../util/colors'
import { StatusBar } from 'expo-status-bar'

export default SplashScreen = () => {
  return (
    <View style={{flex: 1, justifyContent: 'center', alignItems:'center', backgroundColor: purple, paddingBottom: 60}}>
      <StatusBar animated={true} style={'light'} backgroundColor={purple}/>
      <Logo style={{maxWidth: 500, flexBasis: 150}} />
      <ActivityIndicator size="large" color={white}/>
    </View>
  )
}
