// Single source for every outbound link and public fact the landing page states.
// Keep claims aligned with the repository README and docs/privacy-model.md.

export const APP_URL = "https://app.useprivara.xyz";
export const SITE_URL = "https://www.useprivara.xyz";
export const REPO_URL = "https://github.com/Psalmuel01/privara";
export const DOCS_URL = `${REPO_URL}/tree/main/docs`;
export const DEV_GUIDE_URL = `${REPO_URL}/blob/main/docs/developer-guide.md`;
export const PRIVACY_MODEL_URL = `${REPO_URL}/blob/main/docs/privacy-model.md`;
export const SPEC_URL = `${REPO_URL}/blob/main/docs/m2-stealth-spec.md`;
export const THREAT_MODEL_URL = `${REPO_URL}/blob/main/docs/security-threat-model.md`;
export const NPM_URL = "https://www.npmjs.com/package/@privara-stacks/sdk";
export const X_URL = "https://x.com/privarahq";
export const FORUM_URL = "https://forum.stacks.org/t/privara-private-sip-010-payments-with-stealth-addresses-on-stacks/19001";
export const YOUTUBE_ID = "oFFISJjOUYs";
export const RELAYER_HEALTH_URL = "https://privara-production.up.railway.app/health";

export const DEPLOYER = "SP1H7G0B7BBM991P2KA77R0XHDRNYCWH8H808K7AE";
export const explorerAccount = (address: string) => `https://explorer.hiro.so/address/${address}?chain=mainnet`;
// Hiro Explorer serves contract pages under /txid/<contract id>.
export const explorerContract = (contractId: string) => `https://explorer.hiro.so/txid/${contractId}?chain=mainnet`;

export const CONTRACTS = [
  { name: "Stealth registry", id: `${DEPLOYER}.privara-stealth-registry` },
  { name: "sBTC router", id: `${DEPLOYER}.privara-router-m2-sbtc` },
  { name: "USDCx router", id: `${DEPLOYER}.privara-router-m2-usdcx` },
  { name: "Native STX router", id: `${DEPLOYER}.privara-stx-router-v1` },
  { name: "Sponsored-spend helper", id: `${DEPLOYER}.privara-sponsored-spend-v2` },
];

export const STATS = {
  tests: 166,
  testFiles: 25,
  sdkVersion: "0.1.0",
  settlementFee: "1%",
};
