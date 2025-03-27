import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import { z } from "zod";
import { GridTradingStrategy } from "./grid-trading.js";


// Create server instance
export const server = new McpServer({
  name: "sui-tools",
  version: "1.0.0",
});

server.tool("generate-keypair", "Generate a new Sui keypair using Ed25519", {}, async () => {
  const keypair = new Ed25519Keypair();
  const publicKey = keypair.getPublicKey();
  const address = publicKey.toSuiAddress();
  const privateKey = keypair.getSecretKey();

  return {
    content: [
      {
        type: "text",
        text: `Generated Sui Keypair:\n\nAddress: ${address}\nPublic Key: ${publicKey.toBase64()}\nPrivate Key: ${privateKey}\n\nIMPORTANT: Store your private key securely and never share it with anyone!`
      }
    ]
  };
});

const mainnetClient = new SuiClient({ url: getFullnodeUrl('mainnet') });
const testnetClient = new SuiClient({ url: getFullnodeUrl('testnet') });

server.tool("get-balance", "Get balance for a Sui address", {
  address: z.string().min(1).describe("The Sui address to check balance for"),
  network: z.enum(['mainnet', 'testnet']).default('mainnet').describe("The network to check balance on (mainnet or testnet)")
}, async ({ address, network }) => {
  const client = network === 'mainnet' ? mainnetClient : testnetClient;
  try {
    const balance = await client.getBalance({
      owner: address
    });

    return {
      content: [
        {
          type: "text",
          text: `Balance for ${address} on ${network}:\n\nSUI: ${balance.totalBalance} (${Number(balance.totalBalance) / 1000000000} SUI)`
        }
      ]
    };
  } catch (error: any) {
    const errorMessage = error?.message || 'An unknown error occurred';
    return {
      content: [
        {
          type: "text",
          text: `Error getting balance: ${errorMessage}`
        }
      ]
    };
  }
});

server.tool("transfer-sui", "Transfer SUI tokens to another address", {
  privateKey: z.string().min(1).describe("The private key of the sender's account"),
  recipient: z.string().min(1).describe("The recipient's Sui address"),
  amount: z.number().positive().describe("The amount of SUI to transfer (in SUI units, not MIST)"),
  network: z.enum(['mainnet', 'testnet']).default('mainnet').describe("The network to execute the transfer on (mainnet or testnet)")
}, async ({ privateKey, recipient, amount, network }) => {
  try {
    const client = network === 'mainnet' ? mainnetClient : testnetClient;
    // Decode base64 and extract the raw 32-byte key
    const keypair = Ed25519Keypair.fromSecretKey(privateKey);
    const senderAddress = keypair.getPublicKey().toSuiAddress();
    // compute amount
    const amountInMist = amount * 1000000000;
    const tx = new Transaction();
    const [coin] = tx.splitCoins(tx.gas, [amountInMist]);

    // transfer the split coin to a specific address
    tx.transferObjects([coin], tx.pure.address(recipient));

    // Sign and execute the transaction
    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
    });
    await client.waitForTransaction({ digest: result.digest });

    return {
      content: [{
        type: "text",
        text: `Successfully transferred ${amount} SUI from ${senderAddress} to ${recipient}\nTransaction: https://suiscan.xyz/testnet/tx/${result.digest}`
      }]
    };
  } catch (error: any) {
    const errorMessage = error?.message || 'An unknown error occurred';
    return {
      content: [{
        type: "text",
        text: `Error transferring SUI: ${errorMessage}`
      }]
    };
  }
});

server.tool("create-grid-strategy", "Create a new grid trading strategy", {
  upperPrice: z.number().positive().describe("Upper price limit for the grid"),
  lowerPrice: z.number().positive().describe("Lower price limit for the grid"),
  gridCount: z.number().int().positive().describe("Number of grid levels"),
  totalInvestment: z.number().positive().describe("Total investment amount"),
  baseToken: z.string().describe("Base token symbol"),
  quoteToken: z.string().describe("Quote token symbol")
}, async (config) => {
  try {
    const strategy = new GridTradingStrategy(config);
    const gridLevels = strategy.getGridLevels();

    return {
      content: [{
        type: "text",
        text: `Grid Trading Strategy Created:\n\nGrid Levels:\n${gridLevels.map((level, index) =>
          `${index + 1}. Price: ${level.price}\n   Buy Size: ${level.buyOrderSize}\n   Sell Size: ${level.sellOrderSize}\n`
        ).join('')}\nNote: DEX integration pending for order placement.`
      }]
    };
  } catch (error: any) {
    const errorMessage = error?.message || 'An unknown error occurred';
    return {
      content: [{
        type: "text",
        text: `Error creating grid strategy: ${errorMessage}`
      }]
    };
  }
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Sui Tools MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});