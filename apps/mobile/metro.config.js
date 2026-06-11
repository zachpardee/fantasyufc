const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// Redirect relative ./node_modules/* paths to workspace root
// (npm workspaces hoists packages to the root, Metro looks locally)
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.startsWith('./node_modules/') || moduleName.startsWith('../node_modules/')) {
    const packagePath = moduleName.replace(/^\.\.?\/node_modules\//, '');
    return context.resolveRequest(
      context,
      path.resolve(workspaceRoot, 'node_modules', packagePath),
      platform,
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
