const EthereumTx = require('ethereumjs-tx');
const ethUtil = require('ethereumjs-util')
import EthereumTx = require('ethereumjs-tx');
import * as ethUtil from 'ethereumjs-util';
import { addressUtils, BigNumber } from '@0xproject/utils';
import * as _ from 'lodash';

import { PartialTxParams, WalletSubproviderErrors } from 'sane-subproviders/lib/src/types';

import { BaseWalletSubprovider } from 'sane-subproviders/lib/src/subproviders/base_wallet_subprovider';

export interface SignersMap {
    [key: string]: Signer;
}

export interface Signer {
    (message: Buffer): Buffer;
}

function assert(cond: boolean, msg: string): void {
    if (!cond) {
        throw new Error(msg)
    }
}

function assertHexString(value: string): void {
    assert(
        _.isString(value) && (/^0x[0-9A-F]*$/i).test(value),
        `Expected hex string, got value "${value}"`
    );
}

function eip155(i: number, chainId: number): number {
    return chainId * 2 + i
}

function verifyV(msgHash: any, from: string, tx: any, chainId: number, v: number): boolean {
    let pub = ethUtil.ecrecover(msgHash, v, tx.r, tx.s, chainId);
    let addrBuf = ethUtil.pubToAddress(pub);
    let addr = ethUtil.bufferToHex(addrBuf);
    return addr === from
}

function wrapSignTx(sign: Signer, txParams: PartialTxParams): EthereumTx {
    const tx = new EthereumTx(txParams);
    const msgHash = tx.hash(false);
    const rawSig = sign(msgHash);
    const sig = {
        'r': rawSig.slice(0, 32),
        's': rawSig.slice(32, 64)
    };
    Object.assign(tx, sig);

    // Try recovery params
    let v
    tx.v = v = eip155(36, txParams.chainId);
    if (!verifyV(msgHash, txParams.from, tx, txParams.chainId, v)) {
        tx.v = v = eip155(35, txParams.chainId);
    }
    if (!verifyV(msgHash, txParams.from, tx, txParams.chainId, v)) {
        throw new Error('Could not make valid signature')
    }

    return tx;
}

export class OpaqueSignerSubprovider extends BaseWalletSubprovider {

    private readonly _signers: SignersMap
    private readonly _chainID: number
    private readonly _nonces: any = {}

    constructor(chainID: number) {
        super();
        this._signers = {}
        this._chainID = chainID
    }

    public addSigner(address: string, signer: Signer) {
        this._signers[address] = signer
    }

    public removeSigner(address: string) {
        delete this._signers[address]
    }

    public async getAccountsAsync(): Promise<string[]> {
        return Object.keys(this._signers)
    }

    private getSigner(address: string): Signer {
        const signer = this._signers[address];
        if (signer == undefined) {
            throw new Error(
                `Signer for address not found: ${address}`,
            );
        }
        return signer
    }

    public async signTransactionAsync(txParams: PartialTxParams): Promise<string> {
        OpaqueSignerSubprovider._validateTxParams(txParams);
        if (_.isUndefined(txParams.from)) {
            throw new Error('Transaction address undefined')
        }

        // TODO: This nonce-tracking is naive and doesn't work well in races
        // Needs more proper nonce-tracking
        let nonce = ethUtil.bufferToInt(txParams.nonce)
        if (nonce === this._nonces[txParams.from]) {
            nonce = nonce + 1
            txParams.nonce = ethUtil.intToBuffer(nonce)
        }
        this._nonces[txParams.from] = nonce

        txParams.chainId = this._chainID
        const signer = this.getSigner(txParams.from)
        const tx = wrapSignTx(signer, txParams)

        const rawTx = `0x${tx.serialize().toString('hex')}`;
        return rawTx;
    }

    public async signPersonalMessageAsync(data: string, address: string): Promise<string> {
        if (_.isUndefined(data)) {
            throw new Error(WalletSubproviderErrors.DataMissingForSignPersonalMessage);
        }
        throw new Error('Not implemented')
    }

}
