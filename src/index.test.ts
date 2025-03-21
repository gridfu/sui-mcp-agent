import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { fromHex } from '@mysten/sui/utils';


describe('Keypair generation', () => {
  it('should generate correct Sui address from private key', () => {
    const privateKey = 'suiprivkey1qp8hzyxp3wgpygvxthkwktw07m3mnagyyexzuvtj3gv9qh57tl4kc7xa9hd';
    const keypair = Ed25519Keypair.fromSecretKey(privateKey);
    const senderAddress = keypair.getPublicKey().toSuiAddress();
    // 0x2011252062eb033208b51d113b029a3741156a934fab338abdc2c4dc37c041aa
    console.log(senderAddress);
  });
});