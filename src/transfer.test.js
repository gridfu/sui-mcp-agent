// import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
// import { SuiClient } from '@mysten/sui/client';
// import { Transaction } from '@mysten/sui/transactions';
// import { bcs } from '@mysten/sui/bcs';
// describe('transfer-sui', () => {
//   let client: SuiClient;
//   const mockPrivateKey = 'suiprivkey1qp8hzyxp3wgpygvxthkwktw07m3mnagyyexzuvtj3gv9qh57tl4kc7xa9hd';
//   // const senderAddress = '0x2011252062eb033208b51d113b029a3741156a934fab338abdc2c4dc37c041aa';
//   const mockRecipient = '0xc770bfa26f89492a3ee7be947ec783c4b14fbbeec45276b82a6ff708ce1ec888';
//   const mockAmount = 1;
//   beforeEach(() => {
//     client = new SuiClient({ url: 'https://fullnode.testnet.sui.io:443' });
//   });
//   it('should transfer SUI successfully', async () => {
//     const keypair = Ed25519Keypair.fromSecretKey(mockPrivateKey);
//     const senderAddress = keypair.getPublicKey().toSuiAddress();
//     const coins = await client.getCoins({
//       owner: senderAddress,
//       coinType: '0x2::sui::SUI'
//     });
//     const tx = new Transaction();
//     // create a new coin with balance 100, based on the coins used as gas payment
//     // you can define any balance here
//     const [coin] = tx.splitCoins(tx.gas, [10000000]);
//     // transfer the split coin to a specific address
//     tx.transferObjects([coin], tx.pure.address(mockRecipient));
//     // client.signAndExecuteTransaction({ signer: keypair, transaction: tx });
//     const result = await client.signAndExecuteTransaction({ signer: keypair, transaction: tx });
//     await client.waitForTransaction({ digest: result.digest });
//     console.log(result);
//     expect(result.digest).toBeDefined();
//   });
// });
