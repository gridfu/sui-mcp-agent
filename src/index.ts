import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import { z } from "zod";
import { GridTradingStrategy } from "./grid-trading.js";
import { placeLimitOrder, getExpiryTimeMilliseconds } from "7kagCli.js";

const USDC_COIN_TYPE = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
const USDC_ABBR = "USDC";
const SUI_COIN_TYPE = "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";
const SUI_ABBR = "SUI";

function getCoinType(coinType: string) {
  switch (coinType.toUpperCase()) {
    case USDC_ABBR:
      return USDC_COIN_TYPE;
    case SUI_ABBR:
      return SUI_COIN_TYPE;
    default:
      return coinType;
  }
}

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

server.tool("place-limit-order", "Place a limit order for token exchange", {
  pay: z.string().describe("The coin type to pay (e.g., 'SUI' or 'USDC')"),
  payDecimals: z.number().optional().describe("The decimals of the coin to pay with"),
  target: z.string().describe("The coin type to receive (e.g., 'USDC' or 'SUI')"),
  targetDecimals: z.number().optional().describe("The decimals of the coin to receive"),
  amount: z.number().positive().describe("Amount to pay, scaled by the coin's decimals"),
  rate: z.number().positive().describe("Exchange rate of 1 pay coin to target coin"),
  slippage: z.number().min(0).max(10000).default(100).describe("Slippage tolerance, scaled by 10^4"),
  expire: z.number().optional().describe("Expiration timestamp in Unix format (milliseconds)"),
  expireDays: z.number().optional().default(7).describe("Expiration in days"),
  expireHours: z.number().optional().describe("Expiration in hours"),
  expireMinutes: z.number().optional().describe("Expiration in minutes"),
  expireSeconds: z.number().optional().describe("Expiration in seconds"),
  gasBudget: z.string().optional().describe("The gas budget for the transaction"),
  devInspect: z.boolean().default(true).describe("Set to true for development inspection mode"),
  showInput: z.boolean().default(true).describe("Show input for the transaction"),
  showEffects: z.boolean().default(true).describe("Show effects of the transaction"),
  showEvents: z.boolean().default(true).describe("Show events of the transaction"),
  showObjectChanges: z.boolean().default(true).describe("Show object changes of the transaction"),
  showBalanceChanges: z.boolean().default(true).describe("Show balance changes of the transaction"),
  showRawEffects: z.boolean().default(true).describe("Show raw effects of the transaction"),
  showRawInput: z.boolean().default(true).describe("Show raw input of the transaction")
}, async (params) => {
  try {
    await placeLimitOrder({
      ...params,
      pay: getCoinType(params.pay),
      target: getCoinType(params.target),
      amount: params.amount.toString(),
      rate: params.rate.toString(),
      slippage: params.slippage.toString(),
      expiryTimeMilliseconds: params.expire ? BigInt(params.expire).toString() : getExpiryTimeMilliseconds(params as any).toString(),
      dryRun: false
    });

    return {
      content: [{
        type: "text",
        text: `Successfully placed limit order to exchange ${params.amount} ${params.pay} for ${params.target} at rate ${params.rate}`
      }]
    };
  } catch (error: any) {
    const errorMessage = error?.message || 'An unknown error occurred';
    return {
      content: [{
        type: "text",
        text: `Error placing limit order: ${errorMessage}`
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