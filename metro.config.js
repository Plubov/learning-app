// Metro is the bundler that turns the app's code into what runs on the phone
// and in the browser. Expo's default setup is used, with one repair below.
// https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// pdf-lib (splitting uploaded PDFs) ships its own tslib 1.x. That version's
// "import" entry point (modules/index.js) does `import tslib from
// '../tslib.js'` on a file that is not an ES module, which the current
// bundler turns into `undefined`: the app crashed at start with "Cannot
// destructure property '__extends' of 'tslib.default'". Resolving tslib as
// if it were required (Metro then uses the "require" condition instead of
// "import") gives the plain tslib.js, which works.
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'tslib') {
    return context.resolveRequest({ ...context, isESMImport: false }, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
