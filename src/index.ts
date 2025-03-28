import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import { z } from "zod";
import { GridTradingStrategy } from "./grid-trading.js";

import {spawnSync} from 'child_process';


// Create server instance
export const server = new McpServer({
  name: "sui-tools",
  version: "1.0.0",
});

// flash lender protocol
const FLASH_LENDER_OBJECT_ID = "0x2333464724684ef1da1662f3129cf5946c3885946d37f66350305b796cd6babb";
const FLASH_LENDER_PACKAGE_ID = "0x4d8aaa6230fc2153ac7349299fa33f6c8ab3fa833dcd7c8fd62fb2f653ea3d5b";
const SUI_TYPE = "0x2::sui::SUI";

let gridStrategy: GridTradingStrategy | null = null;

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
    gridStrategy = new GridTradingStrategy(config);
    const gridLevels = gridStrategy.getGridLevels();

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

server.tool("get-grid-order-history", "Get all grid order list history", {
}, async (config) => {
  try {
    if (!gridStrategy) throw new Error('Grid strategy not initialized');
const history = gridStrategy.getTradeHistory();

    return {
      content: [{
        type: "text",
        // print order.type order.price order.gridIndex order.timestamp order.quantity
        text: `Order history: ${history.map((order, index) =>
          `${index + 1}. Type: ${order.type}\n   Price: ${order.price}\n   Grid Index: ${order.gridIndex}\n   Time: ${order.timestamp}\n   Quantity: ${order.quantity}\n`
        ).join('')}`
      }]
    };
  } catch (error: any) {
    const errorMessage = error?.message || 'An unknown error occurred';
    return {
      content: [{
        type: "text",
        text: `Error list orders: ${errorMessage}`
      }]
    };
  }
});

  // we want to execute the 7kagCli.ts file with bun and above arguments

  // const program = new Command();

// program
//     .name('7kagCli')
//     .description('CLI to control limit orders with 7kag')
//     .version('0.0.1');

// program.command('listLimitOrders')
//     .description('List open or closed limit orders')
//     .option("-o, --open <true/false>", "List open orders", parseBool, true)
//     .option("-c, --closed <true/false>", "List closed orders", parseBool, true)
//     .option("-a, --account <account>", "The account address to list orders for")
//     .option("--offset <offset>", "The offset for the list")
//     .option("--limit <limit>", "The limit for the list")
//     .option("-t, --tokenPair <tokenPair>", "The token pair to filter by", `${SUI_COIN_TYPE}-${USDC_COIN_TYPE}`)
//     .action(listLimitOrders);

// program.command('placeLimitOrder')
//     .description('Place a limit order')
//     .option("-n, --dryRun <true/false>", "Dry run the transaction", parseBool, true)
//     .option("-p, --pay <pay>", "The coin type to pay with (e.g., USDC)", USDC_COIN_TYPE)
//     .option("--payDecimals <decimals>", "The decimals of the coin to pay with")
//     .option("--gasBudget <budget>", "The gas budget for the transaction")
//     .option("-t, --target <target>", "The coin type to receive (e.g., SUI)", SUI_COIN_TYPE)
//     .option("--targetDecimals <decimals>", "The decimals of the coin to receive")
//     .requiredOption("-a, --amount <amount>", "Amount to pay, scaled by the coin's decimals (e.g., 0.1 USDC = 100000 for 6 decimals)")
//     // Say one USDC is worth 0.25 SUI. Then the rate is 0.25 * 10^(SUI_DECIMALS - USDC_DECIMALS) * 10^RATE_SCALE.
//     // 0.25 * 10^(9 - 6) * 10^12 = 250000000000000. USDC decimals = 6, SUI decimals = 9, so rate scale = 12.
//     .requiredOption("-r, --rate <rate>", "Exchange rate of 1 pay coin to target coin")
//     .option("-s, --slippage <slippage>", "Slippage tolerance, scaled by 10^4. For example: 1% slippage = 0.01 * 10^4 = 100", "100")
//     .option("-e, --expire <expire>", "Expiration timestamp in Unix format (milliseconds)")
//     .option("--expireDays <expireDays>", "Expiration in days", "7")
//     .option("--expireHours <expireHours>", "Expiration in hours")
//     .option("--expireMinutes <expireMinutes>", "Expiration in minutes")
//     .option("--expireSeconds <expireSeconds>", "Expiration in seconds")
//     .option("-d, --devInspect <true/false>", "Set to true for development inspection mode", parseBool, true)
//     .option("--showInput <true/false>", "Show input for the transaction", parseBool, true)
//     .option("--showEffects <true/false>", "Show effects of the transaction", parseBool, true)
//     .option("--showEvents <true/false>", "Show events of the transaction", parseBool, true)
//     .option("--showObjectChanges <true/false>", "Show object changes of the transaction", parseBool, true)
//     .option("--showBalanceChanges <true/false>", "Show balance changes of the transaction", parseBool, true)
//     .option("--showRawEffects <true/false>", "Show raw effects of the transaction", parseBool, true)
//     .option("--showRawInput <true/false>", "Show raw input of the transaction", parseBool, true)
//     .action(placeLimitOrder);

// program.command("cancelLimitOrder")
//     .description('Cancel a limit order')
//     .option("-n, --dryRun <true/false>", "Dry run the transaction", parseBool, true)
//     .requiredOption("-i, --orderId <orderId>", "The unique order ID (retrieved from getOpenLimitOrders)")
//     .option("-p, --pay <pay>", "The coin type used for payment (e.g., USDC)", USDC_COIN_TYPE)
//     .option("-t, --target <target>", "The target coin type (e.g., SUI)", SUI_COIN_TYPE)
//     .action(cancelLimitOrder)

// program.command("claimExpiredLimitOrder")
//     .description('Claim assets from an expired limit order')
//     .option("-n, --dryRun <true/false>", "Dry run the transaction", parseBool, true)
//     .requiredOption("-i, --orderId <orderId>", "The unique order ID (retrieved from getOpenLimitOrders)")
//     .option("-p, --pay <pay>", "The coin type used for payment (e.g., USDC)", USDC_COIN_TYPE)
//     .option("-t, --target <target>", "The target coin type (e.g., SUI)", SUI_COIN_TYPE)
//     .action(claimExpiredLimitOrder)

// program.parse();

// Create server tool from above command line parsing, for example we want to make a tool
// called place-limit-order, we can do it like this:
// server.tool("place-limit-order", "Place a limit order", {
// ...
  // We will run the command bun ./7kagCli listLimitOrders -o true -c false -a 0x1
  // and return the result here
server.tool("place-limit-order", "Place a limit order on 7kag protocol", {
  pay: z.string().describe("The coin type to pay with"),
  payDecimals: z.number().describe("The decimals of the coin to pay with"),
  target: z.string().describe("The coin type to receive"),
  targetDecimals: z.number().describe("The decimals of the coin to receive"),
  amount: z.string().describe("Amount to pay, scaled by the coin's decimals"),
  rate: z.string().describe("Exchange rate of 1 pay coin to target coin"),
  slippage: z.string().describe("Slippage tolerance, scaled by 10^4"),
  expireDays: z.number().describe("Expiration in days"),
  expireHours: z.number().describe("Expiration in hours"),
  expireMinutes: z.number().describe("Expiration in minutes"),
  expireSeconds: z.number().describe("Expiration in seconds"),
  dryRun: z.boolean().describe("Dry run the transaction"),
  devInspect: z.boolean().describe("Set to true for development inspection mode"),
  showInput: z.boolean().describe("Show input for the transaction"),
  showEffects: z.boolean().describe("Show effects of the transaction"),
  showEvents: z.boolean().describe("Show events of the transaction"),
  showObjectChanges: z.boolean().describe("Show object changes of the transaction"),
  showBalanceChanges: z.boolean().describe("Show balance changes of the transaction"),
  showRawEffects: z.boolean().describe("Show raw effects of the transaction"),
  showRawInput: z.boolean().describe("Show raw input of the transaction"),
}, async (config) => {
  console.log("Running command: ");
  try {
    const command= [
      '/Users/flora/workspace/ai/mcp/sui-mcp/src/7kagCli.ts',
      'placeLimitOrder',
      '-n', `${config.dryRun}`,
      '-p', `${config.pay}`,
      '--payDecimals', `${config.payDecimals}`,
      '-t', `${config.target}`,
      '--targetDecimals', `${config.targetDecimals}`,
      '-a', `${config.amount}`,
      '-r', `${config.rate}`,
      '-s', `${config.slippage}`,
      '--expireDays', `${config.expireDays}`,
      '--expireHours', `${config.expireHours}`,
      '--expireMinutes', `${config.expireMinutes}`,
      '--expireSeconds', `${config.expireSeconds}`,
      '--dryRun', `${config.dryRun}`,
      '--devInspect', `${config.devInspect}`,
      '--showInput', `${config.showInput}`,
      '--showEffects', `${config.showEffects}`,
      '--showEvents', `${config.showEvents}`,
      '--showObjectChanges', `${config.showObjectChanges}`,
      '--showBalanceChanges', `${config.showBalanceChanges}`,
      '--showRawEffects', `${config.showRawEffects}`,
      '--showRawInput', `${config.showRawInput}`,
      '--gasBudget', `1000000`,
    ];
    console.log("Running command: ", command.join(" "));
    // execute the command and return the result;
    const {
      stdout,
      stderr,
      status,
        } = await spawnSync("/Users/flora/.bun/bin/bun", command);
    const stdoutString = stdout.toString();
    const stderrString = stderr.toString();
    console.log("Command output: ", stdoutString);
    console.log("Command error: ", stderrString);
    console.log("Command exit code: ", status);
    if (status !== 0) {
      return {
        content: [{
          type: "text",
          text: `Error: ${stderrString}`
        }]
      }
    }
    return {
      content: [{
        type: "text",
        text: `Command output: ${stdoutString}`
      }]
    }
  } catch (error: any) {
    const errorMessage = error?.message || 'An unknown error occurred';
    return {
      content: [{
        type: "text",
        text: `Error: ${errorMessage}`
      }]
    };
  }
});

server.tool("mock-price-change", "Simulate price changes, price changes can not more than grid span", {
  prices: z.array(z.number()).optional().describe("Array of price changes to simulate")
}, async ({ prices }) => {
  if (!gridStrategy) {
    throw new Error('Grid strategy not initialized');
  }
  const priceChanges = prices || [80000, 81000, 82000, 81000, 80000];
  try {
    const initialHistory = gridStrategy.getTradeHistory();
    if (!gridStrategy) {
  throw new Error('Grid strategy not initialized');
}
priceChanges.forEach(price => gridStrategy!.checkPriceMovement(price));
    const updatedHistory = gridStrategy.getTradeHistory();
    const pnl = gridStrategy.getCurrentProfitLoss(priceChanges[priceChanges.length - 1]);

    return {
      content: [{
        type: "text",
        text: `Price changes range: ${priceChanges.join(', ')}\nProfit and Loss: ${pnl}`
      }]
    };
  } catch (error: any) {
    const errorMessage = error?.message || 'An unknown error occurred';
    return {
      content: [{
        type: "text",
        text: `Error mock price changes: ${errorMessage}`
      }]
    };
  }
});

server.tool("get-profit-and-loss", "Get total profit and loss", {
  price: z.number().positive().describe("The current price")
}, async (price) => {
  try {
    if (!gridStrategy) throw new Error('Grid strategy not initialized');
const pnl = gridStrategy.getCurrentProfitLoss(price.price);

    return {
      content: [{
        type: "text",
        text: `Profit and Loss: ${pnl}`
      }]
    };
  } catch (error: any) {
    const errorMessage = error?.message || 'An unknown error occurred';
    return {
      content: [{
        type: "text",
        text: `Error get profit and loss: ${errorMessage}`
      }]
    };
  }
});

server.tool("deposit-to-flash-lender", "Deposit SUI to the flash lender pool", {
  amount: z.number().positive().describe("The amount of SUI to deposit"),
  privateKey: z.string().min(1).describe("The private key of the sender's account"),
  network: z.enum(['mainnet', 'testnet']).default('testnet').describe("The network to execute the deposit on")
}, async ({ amount, privateKey, network }) => {
  try {
    const client = network === 'mainnet' ? mainnetClient : testnetClient;
    const keypair = Ed25519Keypair.fromSecretKey(privateKey);
    const senderAddress = keypair.getPublicKey().toSuiAddress();

    // Convert SUI to MIST (1 SUI = 10^9 MIST)
    const amountInMist = BigInt(Math.floor(amount * 1000000000));

    // Create a transaction to deposit funds
    const tx = new Transaction();

    // Split the coin from gas for deposit
    const [coinToDeposit] = tx.splitCoins(tx.gas, [amountInMist]);

    // Call the deposit function on the flash lender
    tx.moveCall({
      target: `${FLASH_LENDER_PACKAGE_ID}::example::deposit`,
      arguments: [
        tx.object(FLASH_LENDER_OBJECT_ID), // FlashLender shared object
        coinToDeposit                      // Coin to deposit
      ],
      typeArguments: [SUI_TYPE],           // Using SUI as the token type
    });

    // Sign and execute the transaction
    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
    });

    await client.waitForTransaction({ digest: result.digest });

    return {
      content: [{
        type: "text",
        text: `Successfully deposited ${amount} SUI to the flash loan pool from ${senderAddress}.\nTransaction: https://suiscan.xyz/${network}/tx/${result.digest}`
      }]
    };
  } catch (error: any) {
    const errorMessage = error?.message || 'An unknown error occurred';
    return {
      content: [{
        type: "text",
        text: `Error depositing to flash loan pool: ${errorMessage}`
      }]
    };
  }
});

server.tool("withdraw-from-flash-lender", "Withdraw SUI from the flash lender pool", {
  amount: z.number().positive().describe("The amount of SUI to withdraw"),
  privateKey: z.string().min(1).describe("The private key of the sender's account (must be admin)"),
  network: z.enum(['mainnet', 'testnet']).default('testnet').describe("The network to execute the withdrawal on")
}, async ({ amount, privateKey, network }) => {
  try {
    const client = network === 'mainnet' ? mainnetClient : testnetClient;
    const keypair = Ed25519Keypair.fromSecretKey(privateKey);
    const senderAddress = keypair.getPublicKey().toSuiAddress();

    // Convert SUI to MIST
    const amountInMist = BigInt(Math.floor(amount * 1000000000));

    // Create a transaction to withdraw funds
    const tx = new Transaction();

    // Call the withdraw_and_transfer function
    tx.moveCall({
      target: `${FLASH_LENDER_PACKAGE_ID}::example::withdraw_and_transfer`,
      arguments: [
        tx.object(FLASH_LENDER_OBJECT_ID),  // FlashLender shared object
        tx.pure.u64(amountInMist)           // Amount to withdraw
      ],
      typeArguments: [SUI_TYPE],            // Using SUI as the token type
    });

    // Sign and execute the transaction
    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
    });

    await client.waitForTransaction({ digest: result.digest });

    return {
      content: [{
        type: "text",
        text: `Successfully withdrew ${amount} SUI from the flash loan pool to ${senderAddress}.\nTransaction: https://suiscan.xyz/${network}/tx/${result.digest}`
      }]
    };
  } catch (error: any) {
    const errorMessage = error?.message || 'An unknown error occurred';
    return {
      content: [{
        type: "text",
        text: `Error withdrawing from flash loan pool: ${errorMessage}`
      }]
    };
  }
});

server.tool("execute-flash-loan", "Execute a flash loan transaction", {
  amount: z.number().positive().describe("The amount to borrow (in SUI)"),
  privateKey: z.string().min(1).describe("The private key of the borrower's account"),
  network: z.enum(['mainnet', 'testnet']).default('testnet').describe("The network to execute the flash loan on")
}, async ({ amount, privateKey, network }) => {
  try {
    const client = network === 'mainnet' ? mainnetClient : testnetClient;
    const keypair = Ed25519Keypair.fromSecretKey(privateKey);
    const borrowerAddress = keypair.getPublicKey().toSuiAddress();

    // Convert SUI to MIST
    const amountInMist = BigInt(Math.floor(amount * 1000000000));

    // Create a transaction for the flash loan
    const tx = new Transaction();

    // 1. Call loan() function to borrow funds
    const [loanResult, receipt] = tx.moveCall({
      target: `${FLASH_LENDER_PACKAGE_ID}::example::loan`,
      arguments: [
        tx.object(FLASH_LENDER_OBJECT_ID),  // FlashLender shared object
        tx.pure.u64(amountInMist)           // Amount to borrow
      ],
      typeArguments: [SUI_TYPE]
    });

    // your own process for flash loan

    // 2. Call repay() function to return the borrowed funds
    tx.moveCall({
      target: `${FLASH_LENDER_PACKAGE_ID}::example::repay`,
      arguments: [
        tx.object(FLASH_LENDER_OBJECT_ID),  // FlashLender shared object
        loanResult,                         // The borrowed coin
        receipt                             // The loan receipt
      ],
      typeArguments: [SUI_TYPE]
    });

    // Sign and execute the transaction
    const result = await client.signAndExecuteTransaction({
      signer: keypair,
      transaction: tx,
    });

    await client.waitForTransaction({ digest: result.digest });

    return {
      content: [{
        type: "text",
        text: `Successfully executed flash loan of ${amount} SUI by ${borrowerAddress}.\n` +
              `Funds were borrowed and repaid in the same transaction.\n` +
              `Transaction: https://suiscan.xyz/${network}/tx/${result.digest}`
      }]
    };
  } catch (error: any) {
    const errorMessage = error?.message || 'An unknown error occurred';
    return {
      content: [{
        type: "text",
        text: `Error executing flash loan: ${errorMessage}`
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