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

function wrapSignTx(sign: Signer, txParams: PartialTxParams): EthereumTx {
    const tx = new EthereumTx(txParams)
    const msgHash = tx.hash(false)

    const rawSig = sign(msgHash)

    const sig = {
        'r': rawSig.slice(0, 32),
        's': rawSig.slice(32, 32),
    }
    Object.assign(tx, sig)

    function eip155(v: number) {
        const chainId = tx._chainId || 0
        return v + (chainId * 2 + 8)
    }

    // Try recovery params
    tx.v = eip155(27)
    if (!tx.verifySignature()) {
        tx.v = eip155(28)
    }

    return tx
}


export class OpaqueSignerSubprovider extends BaseWalletSubprovider {

    private readonly _signers: SignersMap = {}

    constructor() {
        super();
        this._signers = {}
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
