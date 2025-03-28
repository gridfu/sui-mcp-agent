import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import { SuiClient, getFullnodeUrl } from "@mysten/sui/client";
import { Transaction } from "@mysten/sui/transactions";
import { z } from "zod";
import { GridTradingStrategy } from "./grid-trading.js";
import { placeLimitOrder } from "./7kagCli.js";
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
server.tool("place-limit-order", "Place a limit order", {}, async (options) => {
    await placeLimitOrder(options);
    return {
        content: [
            {
                type: "text",
                text: `Place a limit order`
            }
        ]
    };
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
    }
    catch (error) {
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
    }
    catch (error) {
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
                    text: `Grid Trading Strategy Created:\n\nGrid Levels:\n${gridLevels.map((level, index) => `${index + 1}. Price: ${level.price}\n   Buy Size: ${level.buyOrderSize}\n   Sell Size: ${level.sellOrderSize}\n`).join('')}\nNote: DEX integration pending for order placement.`
                }]
        };
    }
    catch (error) {
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
                coinToDeposit // Coin to deposit
            ],
            typeArguments: [SUI_TYPE], // Using SUI as the token type
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
    }
    catch (error) {
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
                tx.object(FLASH_LENDER_OBJECT_ID), // FlashLender shared object
                tx.pure.u64(amountInMist) // Amount to withdraw
            ],
            typeArguments: [SUI_TYPE], // Using SUI as the token type
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
    }
    catch (error) {
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
                tx.object(FLASH_LENDER_OBJECT_ID), // FlashLender shared object
                tx.pure.u64(amountInMist) // Amount to borrow
            ],
            typeArguments: [SUI_TYPE]
        });
        // your own process for flash loan
        // 2. Call repay() function to return the borrowed funds
        tx.moveCall({
            target: `${FLASH_LENDER_PACKAGE_ID}::example::repay`,
            arguments: [
                tx.object(FLASH_LENDER_OBJECT_ID), // FlashLender shared object
                loanResult, // The borrowed coin
                receipt // The loan receipt
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
    }
    catch (error) {
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
