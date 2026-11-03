module.exports = async function afterSign(context) {
  const {verifyPackagedMobileKeychain}=await import('./mobile-keychain-bundle.mjs');
  await verifyPackagedMobileKeychain(context);
};
