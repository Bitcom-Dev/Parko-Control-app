import { createContext, useContext, useEffect, useState } from "react";
import { removeValue, retrieveValue, saveValue } from "../util/storage";

export const userContext = createContext({});

export const useSession = () => {
    const value = useContext(userContext);
    if (!value) {
        throw new Error('useSession must be used within a SessionProvider');
    }
    return value;
}

export const useAuth = () => {
	const { accessToken, refreshToken, uuid, signOut, setAccessToken, setRefreshToken } = useSession();
	return {
		accessToken,
		refreshToken,
		uuid,
		signOut,
		setAccessToken,
		setRefreshToken
	};
}

export const SessionProvider = ({children}) => {
    const [isLoggedIn, setLoggedIn] = useState(false);
    const [accessToken, setAccessToken] = useState(null);
    const [refreshToken, setRefreshToken] = useState(null);
    const [language, setLanguage] = useState("ro");
    const [uuid, setUUID] = useState(null);
    const [user, setUser] = useState(null);

    const userConfig = {
        isLoggedIn: isLoggedIn,
        setLoggedIn,
        accessToken,
        setAccessToken,
        uuid,
        setUUID,
        refreshToken,
        setRefreshToken,
        user,
        setUser,
        language: language,
        setLanguage,
        signOut: () => {
            setUser(undefined);
        },
		signIn: (data) => {
			setUser({username: data.username, fullName: data.fullName});
			setAccessToken(data.accessToken);
			setRefreshToken(data.refreshToken);
			setUUID(data.uuid);
		}
    };

    useEffect(() => {
		if (uuid === null) {
		  retrieveValue("uuid", setUUID);
		} else if (user === undefined) {
		  removeValue("uuid");
		} else {
		  saveValue("uuid", uuid);
		}
	  }, [uuid]);
	
	  useEffect(() => {
		if (language === null) {
		  retrieveValue("language", (e) => setLanguage(e ? e : "ro"));
		} else {
		  saveValue("language", language);
		}
	  }, [language]);
	
	  useEffect(() => {
		if (user === null) {
		  retrieveValue("user", (e) => {
			setUser(JSON.parse(e));
		  });
		} else if (user === undefined) {
		  removeValue("user");
		  setAccessToken(undefined);
		  setRefreshToken(undefined);
		  setUUID(undefined);
		} else {
		  saveValue("user", JSON.stringify(user));
		}
	
		if (user) {
		  setLoggedIn(true);
		} else {
		  setLoggedIn(false);
		}
	  }, [user]);
	
	  useEffect(() => {
		if (accessToken === null) {
		  retrieveValue("accessToken", setAccessToken);
		} else if (accessToken === undefined) {
		  removeValue("accessToken");
		} else {
		  saveValue("accessToken", accessToken);
		}
	  }, [accessToken]);
	
	  useEffect(() => {
		if (refreshToken === null) {
		  retrieveValue("refreshToken", setRefreshToken);
		} else if (refreshToken === undefined) {
		  removeValue("refreshToken");
		} else {
		  saveValue("refreshToken", refreshToken);
		}
	  }, [refreshToken]);

    return (
        <userContext.Provider value={userConfig}>
            {children}
        </userContext.Provider>
    );
}