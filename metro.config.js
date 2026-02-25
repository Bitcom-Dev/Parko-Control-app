const path = require('path');

const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;

const config = getDefaultConfig(projectRoot);

// Force Metro to resolve React + React Native from the app's root.
// This prevents libraries that mistakenly bundle their own `react-native`
// (nested node_modules) from being loaded, which breaks TurboModules
// (e.g. "PlatformConstants" not found).
const rootNodeModules = path.join(projectRoot, 'node_modules');

config.resolver.extraNodeModules = {
	react: path.join(rootNodeModules, 'react'),
	'react-native': path.join(rootNodeModules, 'react-native'),
};

module.exports = config;
