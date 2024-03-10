module.exports = ({ config }) => {
  config.extra = {
    ...config.extra,
    baseURL: process.env.baseURL ?? "http://86.127.147.26:5000/",
  };
  return {
    ...config,
  };
};
