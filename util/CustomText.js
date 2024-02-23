import {
  Text,
  TouchableOpacity,
  TextInput,
  Animated,
  View,
} from "react-native";
import { useState, forwardRef, useRef, useEffect } from "react";
import { gray, purple } from "./colors";
import { standardMin } from "./style";
import { Ionicons } from '@expo/vector-icons';

export const CustomReadMore = (props) => {
  const [isReadMore, setReadMore] = useState(true);
  return (
    <>
      <Text
        {...props}
        numberOfLines={isReadMore ? 2 : null}
        style={{ ...props.style, fontFamily: "Poppins_500Medium" }}
      >
        {props.children}
      </Text>
      <TouchableOpacity
        style={{ alignSelf: "flex-end" }}
        onPress={() => setReadMore(!isReadMore)}
      >
        <Text
          style={{
            ...props.style,
            fontFamily: "Poppins_700Bold",
            textDecorationLine: "underline",
          }}
        >
          {isReadMore ? "Read more" : "Show less"}
        </Text>
      </TouchableOpacity>
    </>
  );
};

export const CustomTextMedium = (props) => (
  <Text {...props} style={{ ...props.style, fontFamily: "Poppins_500Medium" }}>
    {props.children}
  </Text>
);

export const CustomTextRegular = (props) => (
  <Text {...props} style={{ ...props.style, fontFamily: "Poppins_400Regular" }}>
    {props.children}
  </Text>
);

export const CustomTextBold = (props) => (
  <Text {...props} style={{ ...props.style, fontFamily: "Poppins_700Bold" }}>
    {props.children}
  </Text>
);

export const CustomTextInput = forwardRef((props, ref) => (
  <TextInput
    {...props}
    ref={ref}
    style={{ ...props.style, fontFamily: "Raleway_500Medium" }}
  />
));

const useTogglePasswordVisibility = () => {
  const [passwordVisibility, setPasswordVisibility] = useState(true);
  const [rightIcon, setRightIcon] = useState('eye');

  const handlePasswordVisibility = () => {
    if (rightIcon === 'eye') {
      setRightIcon('eye-off');
      setPasswordVisibility(!passwordVisibility);
    } else if (rightIcon === 'eye-off') {
      setRightIcon('eye');
      setPasswordVisibility(!passwordVisibility);
    }
  };

  return [
    passwordVisibility,
    rightIcon,
    handlePasswordVisibility
  ];
};



export const CustomTextInputFloating = forwardRef((props, ref) => {
  const value = props.value;
  const onChangeText = props.onChangeText;
  const onChange = props.onChange;
  const [height, setHeight] = useState(Math.round((standardMin / 450) * 10) + 20);
  const top = useRef(new Animated.Value(value === "" ? 0 : height)).current;
  const fontSize = useRef(
    new Animated.Value(
      value === "" ? props.style.fontSize : props.style.fontSize - 4
    )
  ).current;
  const onLayout = (event) => {
    const { x, y, height, width } = event.nativeEvent.layout;
    setHeight(height);
  };
  useEffect(() => {
    if (props.value === "") {
      Animated.timing(top, {
        toValue: 0,
        duration: 300,
        useNativeDriver: false,
      }).start();
      Animated.timing(fontSize, {
        toValue: props.style.fontSize,
        duration: 300,
        useNativeDriver: false,
      }).start();
    } else {
      Animated.timing(top, {
        toValue: height,
        duration: 300,
        useNativeDriver: false,
      }).start();
      Animated.timing(fontSize, {
        toValue: props.style.fontSize - 4,
        duration: 300,
        useNativeDriver: false,
      }).start();
    }

  }, [props.value])
  

  const [ passwordVisibility, rightIcon, handlePasswordVisibility ] = useTogglePasswordVisibility();
  
  return (
    <View style={{ ...props.style, borderBottomWidth: 2 }} onLayout={onLayout}>
      <Animated.Text
        style={{
          ...props.styleTextInput,
          bottom: top,
          fontSize: fontSize,
          fontFamily: "Poppins_500Medium",
          position: "absolute",
          left: 10,
        }}
      >
        {props.label}
      </Animated.Text>
      <View style={props.secureTextEntryToogle ? {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'} : {}}>
        <TextInput
          {...props}
          secureTextEntry={props.secureTextEntryToogle ? passwordVisibility : false}
          onFocus={() => {
            Animated.timing(top, {
              toValue: height,
              duration: 300,
              useNativeDriver: false,
            }).start();
            Animated.timing(fontSize, {
              toValue: props.style.fontSize - 4,
              duration: 300,
              useNativeDriver: false,
            }).start();
          }}
          onBlur={() => {
            if (value === "") {
              Animated.timing(top, {
                toValue: 0,
                duration: 300,
                useNativeDriver: false,
              }).start();
              Animated.timing(fontSize, {
                toValue: props.style.fontSize,
                duration: 300,
                useNativeDriver: false,
              }).start();
            }
            if (props.onBlur)
              props.onBlur();
          }}
          value={value}
          onChange={onChange}
          onChangeText={onChangeText}
          ref={ref}
          style={{ ...props.styleTextInput, fontFamily: "Raleway_500Medium", width: props.secureTextEntryToogle ? '90%' : '100%' }}
        />
        {props.secureTextEntryToogle && <TouchableOpacity onPress={handlePasswordVisibility}>
          <Ionicons name={rightIcon} size={Math.round((standardMin / 450) * 10) + 15} color={purple} style={{alignSelf: 'flex-end'}}/>
        </TouchableOpacity>}
      </View>
    </View>
  );
});

