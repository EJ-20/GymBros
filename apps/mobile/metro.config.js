const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// Monorepo: watch shared packages; keep Expo's default watch folders
const defaults = config.watchFolders ?? [];
config.watchFolders = [...new Set([...defaults, workspaceRoot])];

const projectNodeModules = path.resolve(projectRoot, 'node_modules');
const workspaceNodeModules = path.resolve(workspaceRoot, 'node_modules');
config.resolver.nodeModulesPaths = [
  projectNodeModules,
  workspaceNodeModules,
];

module.exports = config;
