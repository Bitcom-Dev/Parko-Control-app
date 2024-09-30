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

export const SessionProvider = ({children, value}) => {
    return (
        <userContext.Provider value={value}>
            {children}
        </userContext.Provider>
    );
}