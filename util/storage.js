import * as SecureStore from "expo-secure-store";

export const setValueAsync = async (key, value) => {
  await SecureStore.setItemAsync(key, value ? String(value) : "");
};

export const getValueAsync = async (key) => {
  const value = await SecureStore.getItemAsync(key);
  if (value != undefined && value !== "") return value;
  return undefined;
};

export const removeValueAsync = async (key) => {
  await SecureStore.deleteItemAsync(key);
};

export const saveValue = async (key, value) => {
  try {
    await SecureStore.setItemAsync(key, value ? value : "");
  } catch (error) {
    // alert(error);
    console.log("Error saving data: " + error);
  } finally {
    // console.log("Saved " + key +" : " + value);
  }
};

export const retrieveValue = async (key, setValue) => {
  try {
    const value = await SecureStore.getItemAsync(key);

    if (value != undefined && value !== "") {
      setValue(value);
    } else {
      setValue(undefined);
    }
    // console.log("Retrieved value: " + value);
  } catch (error) {
    // alert(error);
    setValue(undefined);
    console.log("Error retrieving data: " + error);
  }
};

export const removeValue = async (key) => {
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    // alert(error);
    console.log("Error removing data: " + error);
  }
};
