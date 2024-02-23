module.exports = ({ config }) => {
  config.extra = {
    ...config.extra,
    baseURL: process.env.baseURL ?? "http://192.168.0.104:5000/",
  };
  return {
    ...config,
  };
};
