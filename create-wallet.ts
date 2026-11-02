import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";

const client = initiateDeveloperControlledWalletsClient({
  apiKey: process.env.CIRCLE_API_KEY!,
  entitySecret: process.env.CIRCLE_ENTITY_SECRET!,
});

async function main() {
  const walletSetResponse = await client.createWalletSet({
    name: "SFE DAO Treasury Wallet Set",
  });

  const walletSet = walletSetResponse.data?.walletSet;
  if (!walletSet?.id) {
    throw new Error("Wallet set creation failed: no ID returned");
  }

  console.log("WALLET_SET_ID=" + walletSet.id);

  const walletResponse = await client.createWallets({
    walletSetId: walletSet.id,
    blockchains: ["XLM"],
    count: 1,
    accountType: "EOA",
  });

  const wallet = walletResponse.data?.wallets?.[0];
  if (!wallet) {
    throw new Error("Wallet creation failed: no wallet returned");
  }

  console.log("WALLET_ID=" + wallet.id);
  console.log("WALLET_ADDRESS=" + wallet.address);
  console.log("Wallet set response:", JSON.stringify(walletSetResponse.data));
  console.log("Wallet response:", JSON.stringify(walletResponse.data));
}

main().catch((err) => {
  console.error("Error:", err.message || err);
  process.exit(1);
});
