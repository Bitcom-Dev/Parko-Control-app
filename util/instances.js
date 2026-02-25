import axios from "axios";
import { baseURL, chargingURL } from "./env";

export const authInstance = (context, refresh = false) => {
	const customInstance = axios.create({
		baseURL: baseURL + "auth/",
		headers: {
		Authorization: `TokenCP ${refresh ? context.refreshToken : context.accessToken}${refresh ? " " + context.uuid : ""}`,
		},
	});
	customInstance.interceptors.response.use(
		(response) => {
		return Promise.resolve(response);
		},
		async (error) => {
		if (error.response) {
			if (error.response.status === 403 && error.config.url === "/refresh") {
			context.signOut();
			}
		}

		return Promise.reject(error);
		}
	);
	return customInstance;
};


export const controlInstance = (context) => {
	const customInstance = axios.create({
		baseURL: baseURL + "control/",
		headers: { Authorization: `TokenCP ${context.accessToken}` },
	});
	customInstance.interceptors.response.use(
		(response) => {
		return Promise.resolve(response);
		},
		async (error) => {
		const originalConfig = error.config;
		if (error.response) {
			if (error.response.status === 401 && !originalConfig._retry) {
			originalConfig._retry = true;
			return authInstance(context, true)
				.get("/refresh")
				.then((response) => {
				if (response.status === 200) {
					context.setAccessToken(response.data.accessToken);
					originalConfig.headers.Authorization = `TokenCP ${response.data.accessToken}`;
					return customInstance(originalConfig);
				}
				if (response.status === 201) {
					context.setAccessToken(response.data.accessToken);
					context.setRefreshToken(response.data.refreshToken);
					originalConfig.headers.Authorization = `TokenCP ${response.data.accessToken}`;
					return customInstance(originalConfig);
				}
				});
			}
		}

		return Promise.reject(error);
		}
	);
	return customInstance;
};

export const lprInstance = (context) => {
	const customInstance = axios.create({
		baseURL: baseURL + "lpr/",
		headers: { Authorization: `TokenCP ${context.accessToken}` },
	});
	customInstance.interceptors.response.use(
		(response) => {
		return Promise.resolve(response);
		},
		async (error) => {
		const originalConfig = error.config;
		if (error.response) {
			if (error.response.status === 401 && !originalConfig._retry) {
			originalConfig._retry = true;
			return authInstance(context, true)
				.get("/refresh")
				.then((response) => {
				if (response.status === 200) {
					context.setAccessToken(response.data.accessToken);
					originalConfig.headers.Authorization = `TokenCP ${response.data.accessToken}`;
					return customInstance(originalConfig);
				}
				if (response.status === 201) {
					context.setAccessToken(response.data.accessToken);
					context.setRefreshToken(response.data.refreshToken);
					originalConfig.headers.Authorization = `TokenCP ${response.data.accessToken}`;
					return customInstance(originalConfig);
				}
				});
			}
		}

		return Promise.reject(error);
		}
	);
	return customInstance;
};

export const notaConstatareInstance = (context) => {
	const customInstance = axios.create({
		baseURL: baseURL + "nota_constatare/",
		headers: { Authorization: `TokenCP ${context.accessToken}` },
	});
	customInstance.interceptors.response.use(
		(response) => {
		return Promise.resolve(response);
		},
		async (error) => {
		const originalConfig = error.config;
		if (error.response) {
			if (error.response.status === 401 && !originalConfig._retry) {
			originalConfig._retry = true;
			return authInstance(context, true)
				.get("/refresh")
				.then((response) => {
				if (response.status === 200) {
					context.setAccessToken(response.data.accessToken);
					originalConfig.headers.Authorization = `TokenCP ${response.data.accessToken}`;
					return customInstance(originalConfig);
				}
				if (response.status === 201) {
					context.setAccessToken(response.data.accessToken);
					context.setRefreshToken(response.data.refreshToken);
					originalConfig.headers.Authorization = `TokenCP ${response.data.accessToken}`;
					return customInstance(originalConfig);
				}
				});
			}
		}

		return Promise.reject(error);
		}
	);
	return customInstance;
};