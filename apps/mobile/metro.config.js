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

// React must resolve to a single copy. npm hoists a different react version to
// the workspace root (for the web app), so force every import of react to the
// mobile app's local copy.
const SINGLETONS = new Set(['react', 'scheduler']);

// Redirect relative ./node_modules/* paths to workspace root
// (npm workspaces hoists packages to the root, Metro looks locally)
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const basePkg = moduleName.startsWith('@')
    ? moduleName.split('/').slice(0, 2).join('/')
    : moduleName.split('/')[0];
  if (SINGLETONS.has(basePkg)) {
    return context.resolveRequest(
      { ...context, originModulePath: path.join(projectRoot, 'package.json') },
      moduleName,
      platform,
    );
  }
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
