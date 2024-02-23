import * as SecureStore from "expo-secure-store";

export const saveValue = async (key, value) => {
  try {
    await SecureStore.setItemAsync(key, value ? value : "");
  } catch (error) {
    // alert(error);
  }
};

export const retrieveValue = async (key, setValue) => {
  try {
    const value = await SecureStore.getItemAsync(key);

    if (value != undefined && value !== "") {
      setValue(value);
    } else {
      setValue(null);
    }
  } catch (error) {
    // alert(error);
    setValue(null);
  }
};

export const removeValue = async (key) => {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    // alert(error);
  }
};
