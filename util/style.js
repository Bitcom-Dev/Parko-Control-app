import { StyleSheet, Platform, StatusBar, Dimensions } from "react-native";
import {
  black,
  purple,
  lightOrange,
  white
} from './colors.js';

export const standardMin = Math.min(
  Dimensions.get("window").width,
  Dimensions.get("window").height
);
export const standardMax = Math.max(
  Dimensions.get("window").width,
  Dimensions.get("window").height
);

export const resize = (no) => Math.round((standardMin / 450) * no);

export const isPortrait = (dimensions) => {
  return dimensions.screen.height >= dimensions.screen.width;
};

export const general = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
    backgroundColor: lightOrange,
  },
  fontSize4: {
    fontSize: Math.round((standardMin / 450) * 14),
  },
  fontSize6: {
    fontSize: Math.round((standardMin / 450) * 16),
  },
  fontSize8: {
    fontSize: Math.round((standardMin / 450) * 18),
  },
  fontSize10: {
    fontSize: Math.round((standardMin / 450) * 20),
  },
  fontSize12: {
    fontSize: Math.round((standardMin / 450) * 22),
  },
  fontSize14: {
    fontSize: Math.round((standardMin / 450) * 24),
  },
  fontSize16: {
    fontSize: Math.round((standardMin / 450) * 26),
  },
  fontSize30: {
    fontSize: Math.round((standardMin / 450) * 40),
  },
  shaddow: {
    shadowColor: black,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.8,
    shadowRadius: 12,

    elevation: 18,
  },
  shaddowLight: {
    shadowColor: black,
    shadowOffset:{
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.23,
    shadowRadius: 2.62,
    elevation: 4,
  },
  shaddowLighter: {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.20,
    shadowRadius: 1.41,

    elevation: 2,
  },
  shaddowDark: {
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 12,
    },
    shadowOpacity: 0.58,
    shadowRadius: 16.00,

    elevation: 24,
  },
  shaddowDarker: {
    shadowColor: "#000000",
    shadowOffset: {
      width: 0,
      height: 18,
    },
    shadowOpacity:  0.25,
    shadowRadius: 20.00,
    elevation: 24
  },
  textShaddowWhite: {
    textShadowColor: white,
    textShadowOffset: {width: 0.7, height: 0.7},
    textShadowRadius: 10,
  },
  textShaddowpurple: {
    textShadowColor: purple,
    textShadowOffset: {width: 1, height: 1},
    textShadowRadius: 5
  },
  textShaddowBlack: {
    textShadowColor: black,
    textShadowOffset: {width: .5, height: .5},
    textShadowRadius: 5
  }
});
