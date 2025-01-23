const express = require("express");
const solanaWeb3 = require("@solana/web3.js");
const app = express();

const QUICKNODE_RPC_URL =
  "https://spring-weathered-forest.solana-mainnet.quiknode.pro/2cd1981a5dc319c4f19f90747802205084e5c34d";

// connect to quick node rpc
const connection = new solanaWeb3.Connection(QUICKNODE_RPC_URL);

const PORT = 5000;

app.get("/api/track/wallet/:walletPublicKey", (req, res) => {
  if (req.params.walletPublicKey) {
    const walletPublicKey = new solanaWeb3.PublicKey(
      req.params.walletPublicKey
    );
    monitorWalletSwaps(walletPublicKey);
  }
});

app.get("/api/track/token/:mintAddress", (req, res) => {
  if (req.params.mintAddress) {
    console.log("mintAddress", req.params.mintAddress);
    fetchTopHolders(req.params.mintAddress).then((tokenHolderList) => {
      monitorTopHolders(tokenHolderList);
      res.status(200).json(tokenHolderList);
    });
  }
});

// start the server
app.listen(PORT, () =>
  console.log(`Server is running on http://localhost:${PORT}`)
);

async function monitorWalletSwaps(walletPublicKey, rank) {
  const subscriptionId = connection.onAccountChange(
    walletPublicKey,
    async (updatedAccountInfo, context) => {
      // fetch the most recent transaction affecting the wallet
      const signatures = await connection.getSignaturesForAddress(
        walletPublicKey,
        { limit: 1 }
      );
      const transactionSignature = signatures[0].signature;
      // fetch transaction details
      connection
        .getTransaction(transactionSignature, {
          commitment: "confirmed",
          maxSupportedTransactionVersion: 0,
        })
        .then((transaction) => {
          if (transaction) {
            // check for program-specific swaps (e.g., Serum, Raydium)
            if (transaction.meta.logMessages) {
              const logMessages = transaction.meta.logMessages.join("\n");
              if (
                logMessages.includes("swap") ||
                logMessages.includes("trade")
              ) {
                if (rank) {
                  console.log(
                    `swap detected from ${walletPublicKey}(top ${rank})`
                  );
                } else {
                  console.log(`swap detected from ${walletPublicKey}`);
                }
              }
            }
          }
        });
    }
  );
}

const fetchTopHolders = async (mintAddress) => {
  try {
    const topHolderList = [];
    const publicKey = new solanaWeb3.PublicKey(mintAddress);
    const tokenSupply = await fetchTokenSupply(mintAddress);
    console.log("tokenSupply:", tokenSupply);
    const tokenLargestAccounts = await connection.getTokenLargestAccounts(
      publicKey
    );
    const topHolders = tokenLargestAccounts.value;
    topHolders.forEach((account, index) => {
      topHolderList.push({
        rank: index + 1,
        percentage:
          ((account.uiAmountString / tokenSupply) * 100).toFixed(2) + "%",
        address: account.address,
        quantity: parseFloat(account.uiAmountString).toFixed(2),
      });
    });
    return topHolderList;
  } catch (error) {
    console.error(error);
  }
};

const fetchTokenSupply = async (mintAddress) => {
  const publicKey = new solanaWeb3.PublicKey(mintAddress);
  const supplyResult = await connection.getTokenSupply(publicKey);
  const {
    value: { amount, decimals },
  } = supplyResult;
  const circulatingSupply = parseInt(amount) / Math.pow(10, decimals);
  return circulatingSupply;
};

const monitorTopHolders = async (topHolderList) => {
  for (let i = 0; i < topHolderList.length; i++) {
    monitorWalletSwaps(topHolderList[i].address, topHolderList[i].rank);
    await delay(1000);
  }
};

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default app;