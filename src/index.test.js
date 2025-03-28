"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var ed25519_1 = require("@mysten/sui/keypairs/ed25519");
describe('Keypair generation', function () {
    it('should generate correct Sui address from private key', function () {
        var privateKey = 'suiprivkey1qp8hzyxp3wgpygvxthkwktw07m3mnagyyexzuvtj3gv9qh57tl4kc7xa9hd';
        var keypair = ed25519_1.Ed25519Keypair.fromSecretKey(privateKey);
        var senderAddress = keypair.getPublicKey().toSuiAddress();
        // 0x2011252062eb033208b51d113b029a3741156a934fab338abdc2c4dc37c041aa
        console.log(senderAddress);
    });
});
