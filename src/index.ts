import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { bcs } from "@mysten/sui/bcs";
import { z } from "zod";
import { GridTradingStrategy } from "./grid-trading.js";

const mainnetClient = new SuiClient({ url: getFullnodeUrl('mainnet') });
const testnetClient = new SuiClient({ url: getFullnodeUrl('testnet') });

// Create server instance
export const server = new McpServer({
  name: "sui-tools",
  version: "1.0.0",
});

// flash lender protocol
const FLASH_LENDER_OBJECT_ID = "0x2333464724684ef1da1662f3129cf5946c3885946d37f66350305b796cd6babb";
const FLASH_LENDER_PACKAGE_ID = "0x4d8aaa6230fc2153ac7349299fa33f6c8ab3fa833dcd7c8fd62fb2f653ea3d5b";
const SUI_TYPE = "0x2::sui::SUI";

// server.tool("place-limit-order", "Place a limit order", {}, async (options) => {
//   await placeLimitOrder(options);
//   return {
//     content: [
//       {
//         type: "text",
//         text: `Placed limit order`
//       }
//     ]
//   };
// });

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

// These two imports are necessary for the code to work, because the SDK has a dependency on them.
// But they are not declared as dependencies in the package.json file.
import "bignumber.js";
import "bn.js";

import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import type { Transaction } from '@mysten/sui/transactions';
import type { ExecuteTransactionBlockParams } from '@mysten/sui/client';
import sdk from "@7kprotocol/sdk-ts";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import process from "node:process";
import { Command } from "commander";

const ED25519_DERIVATION_PATH = `m/44'/784'/0'/0'/0'`;
const USDC_COIN_TYPE = "0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC";
const USDC_ABBR = "USDC";
const SUI_COIN_TYPE = "0x0000000000000000000000000000000000000000000000000000000000000002::sui::SUI";
const SUI_ABBR = "SUI";
const RATE_SCALE = 12;
const USDC_DECIMALS = 6;
const SUI_DECIMALS = 9;

function parseBool(val: string): boolean {
  const trulyRe = /^(true|1|on)$/i;
  const falsyRe = /^(false|0|off)$/i;
  if (trulyRe.test(val)) {
    return true;
  }
  if (falsyRe.test(val)) {
    return false;
  }
  throw new Error(`Invalid boolean value: ${val}`);
}

function getExecutionOptions(options: any): ExecuteTransactionBlockOptions {
  return {
    showInput: options.showInput,
    showEffects: options.showEffects,
    showEvents: options.showEvents,
    showObjectChanges: options.showObjectChanges,
    showBalanceChanges: options.showBalanceChanges,
    showRawEffects: options.showRawEffects,
    showRawInput: options.showRawInput,
  };
}

async function placeLimitOrder(options: any) {
  const keypair = getKeyPair();
  const sender = keypair.getPublicKey().toSuiAddress();

  const expiryTimeMillisecond = getExpiryTimeMilliseconds(options);
  console.log(`Sending a transaction from ${sender} that will expire at ${expiryTimeMillisecond}`);
  const amount = BigInt(options.amount);
  const payRate = getExchangeRate(options.payDecimals || getCoinDecimals(options.pay), options.targetDecimals || getCoinDecimals(options.target), options.rate);

  const placeLimitOrderInput = {
    accountAddress: sender,
    payCoinType: getCoinType(options.pay),
    targetCoinType: getCoinType(options.target),
    payCoinAmount: amount,
    rate: payRate, // Exchange rate scaled by 10^12.
    slippage: BigInt(options.slippage), // Slippage tolerance, scaled by 10^4.
    expireTs: expiryTimeMillisecond,
    devInspect: options.devInspect,
  };

  console.log(`Placing limit order from ${sender} with input:`, placeLimitOrderInput);

  const tx = await sdk.placeLimitOrder(placeLimitOrderInput);

  const execOptions = getExecutionOptions(options);

  executeTransaction(keypair, tx, {
    gasBudget: options.gasBudget ? BigInt(options.gasBudget) : undefined,
    dryRun: options.dryRun,
    execOptions,
  });
}

function getAccount(account?: string) {
  if (account) {
    return account;
  }
  try {
    const keypair = getKeyPair();
    return keypair.getPublicKey().toSuiAddress();
  } catch (error) {
    console.log("Account not provided, and we didn't get the sender from keypair", error);
    throw error;
  }
}

async function listLimitOrders(options: any) {
  const sender = getAccount(options.account);

  const listLimitOrdersInput = {
    owner: sender,
    offset: options.offset,
    limit: options.limit,
    tokenPair: options.tokenPair,
  };

  console.log(`Listing limit orders for ${listLimitOrdersInput.owner} with input:`, listLimitOrdersInput);

  if (!options.open && !options.closed) {
    throw new Error("Please specify whether to list open or closed orders");
  }

  if (options.open) {
    const openOrders = await sdk.getOpenLimitOrders(listLimitOrdersInput);
    console.log("Open orders:", openOrders);
  }
  if (options.closed) {
    const closedOrders = await sdk.getClosedLimitOrders(listLimitOrdersInput);
    console.log("Closed orders:", closedOrders);
  }
}

async function cancelLimitOrder(options: any) {
  const keypair = getKeyPair();
  const sender = keypair.getPublicKey().toSuiAddress();

  const cancelLimitOrderInput = {
    orderId: options.orderId,
    payCoinType: getCoinType(options.pay),
    targetCoinType: getCoinType(options.target),
  };

  console.log(`Cancelling limit order from ${sender} with input:`, cancelLimitOrderInput);

  const tx = await sdk.cancelLimitOrder(cancelLimitOrderInput);

  const execOptions = getExecutionOptions(options);

  executeTransaction(keypair, tx, {
    dryRun: options.dryRun,
    execOptions,
  });
}

async function claimExpiredLimitOrder(options: any) {
  const keypair = getKeyPair();
  const sender = keypair.getPublicKey().toSuiAddress();

  const claimExpiredLimitOrderInput = {
    orderId: options.orderId,
    payCoinType: getCoinType(options.pay),
    targetCoinType: getCoinType(options.target),
  };

  console.log(`Claiming expired limit order from ${sender} with input:`, claimExpiredLimitOrderInput);

  const tx = await sdk.claimExpiredLimitOrder(claimExpiredLimitOrderInput);

  const execOptions = getExecutionOptions(options);

  executeTransaction(keypair, tx, {
    dryRun: options.dryRun,
    execOptions,
  });
}

function getCoinDecimals(coinType: string) {
  switch (getCoinType(coinType)) {
    case USDC_COIN_TYPE:
      return USDC_DECIMALS;
    case SUI_COIN_TYPE:
      return SUI_DECIMALS;
    default:
      throw new Error(`Unknown coin type: ${coinType}`);
  }
}

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

function getExchangeRate(payDecimals: number, targetDecimals: number, exchangeRate: number): bigint {
  return BigInt(exchangeRate * 10 ** (RATE_SCALE + targetDecimals - payDecimals));
}

const network = "mainnet";
const suiClient = new SuiClient({ url: getFullnodeUrl(network) });
sdk.setSuiClient(suiClient);

function getKeyPair() {
  const mnemonics = process.env.MNEMONICS;
  if (!mnemonics) {
    throw new Error("Please set the environment variable MNEMONICS");
  }
  return Ed25519Keypair.deriveKeypair(mnemonics, ED25519_DERIVATION_PATH);
}

function getExpiryTimeMilliseconds(parameters: {
  expire?: bigint,
  expireDays?: number,
  expireHours?: number,
  expireMinutes?: number,
  expireSeconds?: number,
}) {
  console.log(parameters);
  if (parameters.expire) {
    return parameters.expire;
  }
  const daysInMs = parameters.expireDays ? parameters.expireDays * 24 * 60 * 60 * 1000 : 0;
  const hoursInMs = parameters.expireHours ? parameters.expireHours * 60 * 60 * 1000 : 0;
  const minutesInMs = parameters.expireMinutes ? parameters.expireMinutes * 60 * 1000 : 0;
  const secondsInMs = parameters.expireSeconds ? parameters.expireSeconds * 1000 : 0;
  return BigInt(Date.now() + daysInMs + hoursInMs + minutesInMs + secondsInMs);
}

async function signTransaction(transaction: Transaction, signer: Ed25519Keypair, gasBudget?: bigint) {
  const transactionBytes = await buildTransactionBytes(transaction, signer, gasBudget);
  return await signer.signTransaction(transactionBytes);
}

async function buildTransactionBytes(transaction: Transaction, signer?: Ed25519Keypair, gasBudget?: bigint) {
  let transactionBytes: Uint8Array;
  if (transaction instanceof Uint8Array) {
    transactionBytes = transaction;
  } else {
    if (signer) {
      transaction.setSenderIfNotSet(signer.toSuiAddress());
    }
    if (gasBudget) {
      transaction.setGasBudget(gasBudget);
    }
    transactionBytes = await transaction.build({ client: suiClient });
  }
  return transactionBytes;
}

type ExecuteTransactionBlockOptions = ExecuteTransactionBlockParams["options"];

async function executeTransaction(signer: Ed25519Keypair, tx: Transaction, extraOptions: {
  gasBudget?: bigint,
  dryRun?: boolean,
  execOptions: ExecuteTransactionBlockOptions,
}) {
  const { signature, bytes } = await signTransaction(tx, signer, extraOptions.gasBudget);
  if (extraOptions.dryRun) {
    console.log("Dry running transaction", tx.toJSON(), bytes)
    const result = await suiClient.dryRunTransactionBlock({ transactionBlock: bytes });
    console.log("Transaction dry run result", result);
  } else {
    console.log("Executing transaction", tx.toJSON(), bytes)
    const result = await suiClient.executeTransactionBlock({
      transactionBlock: bytes,
      signature,
      options: extraOptions.execOptions,
    });
    console.log("Transaction execution result", result);
  }
}
