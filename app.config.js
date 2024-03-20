module.exports = ({ config }) => {
  config.extra = {
    ...config.extra,
    baseURL: process.env.baseURL ?? "https://control.parko.ai/api/",
  };
  return {
    ...config,
  };
};
