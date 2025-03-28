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


const program = new Command();

program
    .name('7kagCli')
    .description('CLI to control limit orders with 7kag')
    .version('0.0.1');

program.command('listLimitOrders')
    .description('List open or closed limit orders')
    .option("-o, --open <true/false>", "List open orders", parseBool, true)
    .option("-c, --closed <true/false>", "List closed orders", parseBool, true)
    .option("-a, --account <account>", "The account address to list orders for")
    .option("--offset <offset>", "The offset for the list")
    .option("--limit <limit>", "The limit for the list")
    .option("-t, --tokenPair <tokenPair>", "The token pair to filter by", `${SUI_COIN_TYPE}-${USDC_COIN_TYPE}`)
    .action(listLimitOrders);

program.command('placeLimitOrder')
    .description('Place a limit order')
    .option("-n, --dryRun <true/false>", "Dry run the transaction", parseBool, true)
    .option("-p, --pay <pay>", "The coin type to pay with (e.g., USDC)", USDC_COIN_TYPE)
    .option("--payDecimals <decimals>", "The decimals of the coin to pay with")
    .option("--gasBudget <budget>", "The gas budget for the transaction")
    .option("-t, --target <target>", "The coin type to receive (e.g., SUI)", SUI_COIN_TYPE)
    .option("--targetDecimals <decimals>", "The decimals of the coin to receive")
    .requiredOption("-a, --amount <amount>", "Amount to pay, scaled by the coin's decimals (e.g., 0.1 USDC = 100000 for 6 decimals)")
    // Say one USDC is worth 0.25 SUI. Then the rate is 0.25 * 10^(SUI_DECIMALS - USDC_DECIMALS) * 10^RATE_SCALE.
    // 0.25 * 10^(9 - 6) * 10^12 = 250000000000000. USDC decimals = 6, SUI decimals = 9, so rate scale = 12.
    .requiredOption("-r, --rate <rate>", "Exchange rate of 1 pay coin to target coin")
    .option("-s, --slippage <slippage>", "Slippage tolerance, scaled by 10^4. For example: 1% slippage = 0.01 * 10^4 = 100", "100")
    .option("-e, --expire <expire>", "Expiration timestamp in Unix format (milliseconds)")
    .option("--expireDays <expireDays>", "Expiration in days", "7")
    .option("--expireHours <expireHours>", "Expiration in hours")
    .option("--expireMinutes <expireMinutes>", "Expiration in minutes")
    .option("--expireSeconds <expireSeconds>", "Expiration in seconds")
    .option("-d, --devInspect <true/false>", "Set to true for development inspection mode", parseBool, true)
    .option("--showInput <true/false>", "Show input for the transaction", parseBool, true)
    .option("--showEffects <true/false>", "Show effects of the transaction", parseBool, true)
    .option("--showEvents <true/false>", "Show events of the transaction", parseBool, true)
    .option("--showObjectChanges <true/false>", "Show object changes of the transaction", parseBool, true)
    .option("--showBalanceChanges <true/false>", "Show balance changes of the transaction", parseBool, true)
    .option("--showRawEffects <true/false>", "Show raw effects of the transaction", parseBool, true)
    .option("--showRawInput <true/false>", "Show raw input of the transaction", parseBool, true)
    .action(placeLimitOrder);

program.command("cancelLimitOrder")
    .description('Cancel a limit order')
    .option("-n, --dryRun <true/false>", "Dry run the transaction", parseBool, true)
    .requiredOption("-i, --orderId <orderId>", "The unique order ID (retrieved from getOpenLimitOrders)")
    .option("-p, --pay <pay>", "The coin type used for payment (e.g., USDC)", USDC_COIN_TYPE)
    .option("-t, --target <target>", "The target coin type (e.g., SUI)", SUI_COIN_TYPE)
    .action(cancelLimitOrder)

program.command("claimExpiredLimitOrder")
    .description('Claim assets from an expired limit order')
    .option("-n, --dryRun <true/false>", "Dry run the transaction", parseBool, true)
    .requiredOption("-i, --orderId <orderId>", "The unique order ID (retrieved from getOpenLimitOrders)")
    .option("-p, --pay <pay>", "The coin type used for payment (e.g., USDC)", USDC_COIN_TYPE)
    .option("-t, --target <target>", "The target coin type (e.g., SUI)", SUI_COIN_TYPE)
    .action(claimExpiredLimitOrder)

program.parse();

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
