const EthereumTx = require('ethereumjs-tx');
const ethUtil = require('ethereumjs-util')
// Import statements for the (out of date) type information
type EthereumTx = import('ethereumjs-tx');
type ethUtil = typeof import('ethereumjs-util');
import { JSONRPCRequestPayload } from 'ethereum-types';

import _ from 'lodash';
import { PartialTxParams, Callback, ErrorCallback,  } from 'sane-subproviders/lib/src/types';
import { Subprovider } from 'sane-subproviders/lib/src/subproviders/subprovider';

export type Signer = (message: Buffer) => Promise<Buffer>;

interface Signature {
    r: Buffer
    s: Buffer
    v: number
}

function eip155(i: number, chainId: number): number {
    return chainId * 2 + i
}

function verifyV(msgHash: Buffer, from: string, sig: Signature, chainId: number): boolean {
    const pub = ethUtil.ecrecover(msgHash, sig.v, sig.r, sig.s, chainId);
    const addrBuf = ethUtil.pubToAddress(pub);
    const addr = ethUtil.bufferToHex(addrBuf);

    return addr === from
}

async function wrapSignTx(sign: Signer, txParams: PartialTxParams): Promise<EthereumTx> {
    const tx = new EthereumTx(txParams);
    const msgHash = tx.hash(false);

    let sig
    do {
        const rawSig = await sign(msgHash)
        sig = {
            r: rawSig.slice(0, 32),
            s: rawSig.slice(32, 64),
            v: parseInt(rawSig.slice(64).toString('hex'), 16)
        };
        // Depending on genesis, negative values for 's' might not be accepted
    } while (sig.s[0] >= 0x80)

    if (isNaN(sig.v)) {
        // Try recovery params
        sig.v = eip155(36, txParams.chainId);
        if (!verifyV(msgHash, txParams.from, sig, txParams.chainId)) {
            sig.v = eip155(35, txParams.chainId);
            if (!verifyV(msgHash, txParams.from, sig, txParams.chainId)) {
                throw new Error(`Could not make valid signature for ${txParams.from}`)
            }
        }
    }

    return Object.assign(tx, sig);
}

export class OpaqueSignerSubprovider extends Subprovider {

    private readonly _signers = new Map<string,Signer>();
    private readonly _chainID: number;

    constructor(chainID: number) {
        super();
        this._chainID = chainID;
    }

    public addSigner(address: string, signer: Signer) {
        this._signers.set(address, signer);
    }

    public removeSigner(address: string) {
        this._signers.delete(address);
    }

    private getSigner(address: string): Signer {
        const signer = this._signers.get(address);
        if (signer === undefined) {
            throw new Error(
                `Signer for address not found: ${address}`,
            );
        }
        return signer
    }

    public async signTransactionAsync(txParams: PartialTxParams): Promise<string> {
        txParams.chainId = this._chainID
        const signer = this.getSigner(txParams.from)
        const tx = await wrapSignTx(signer, txParams)

        const rawTx = `0x${tx.serialize().toString('hex')}`;
        return rawTx;
    }

    public async handleRequest(payload: JSONRPCRequestPayload, next: Callback, end: ErrorCallback): Promise<void> {
        let txParams;
        switch (payload.method) {
            case 'eth_signTransaction':
                txParams = payload.params[0];
                try {
                    const filledParams = await this._populateMissingTxParamsAsync(txParams);
                    const signedTx = await this.signTransactionAsync(filledParams);
                    const result = {
                        raw: signedTx,
                        tx: txParams,
                    };
                    end(null, result);
                } catch (err) {
                    end(err);
                }
                return;

            default:
                next();
                return;
        }
    }

    private async _populateMissingTxParamsAsync(partialTxParams: PartialTxParams): Promise<PartialTxParams> {
        let txParams = partialTxParams;
        if (_.isUndefined(partialTxParams.gasPrice)) {
            const gasPriceResult = await this.emitPayloadAsync({
                method: 'eth_gasPrice',
                params: [],
            });
            const gasPrice = gasPriceResult.result.toString();
            txParams = { ...txParams, gasPrice };
        }
        if (_.isUndefined(partialTxParams.nonce)) {
            const nonceResult = await this.emitPayloadAsync({
                method: 'eth_getTransactionCount',
                params: [partialTxParams.from, 'pending'],
            });
            const nonce = nonceResult.result;
            txParams = { ...txParams, nonce };
        }
        if (_.isUndefined(partialTxParams.gas)) {
            const gasResult = await this.emitPayloadAsync({
                method: 'eth_estimateGas',
                params: [partialTxParams],
            });
            const gas = gasResult.result.toString();
            txParams = { ...txParams, gas };
        }
        return txParams;
    }

}
