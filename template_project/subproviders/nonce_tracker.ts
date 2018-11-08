import _ from 'lodash';
import { addressUtils } from '@0xproject/utils';
import { JSONRPCRequestPayload, JSONRPCResponsePayload } from 'ethereum-types';
import { Callback, ErrorCallback, PartialTxParams, WalletSubproviderErrors } from 'sane-subproviders/lib/src/types';
import { Subprovider } from 'sane-subproviders/lib/src/subproviders/subprovider';
import AsyncLock from 'async-lock';

export class NonceTrackerSubprovider extends Subprovider {

    private readonly _lock = new AsyncLock();
    private readonly _addresses:Set<string>;

    constructor(addresses:Set<string>) {
        super();
        this._addresses = addresses;
    }

    // Copied from BaseWalletSubprovider
    private static _validateSender(sender: string): void {
        if (_.isUndefined(sender) || !addressUtils.isAddress(sender)) {
            throw new Error(WalletSubproviderErrors.SenderInvalidOrNotSupplied);
        }
    }

    public async handleRequest(payload: JSONRPCRequestPayload, next: Callback, end: ErrorCallback): Promise<void> {
        switch (payload.method) {
            case 'eth_sendTransaction':
                try {
                    const txParams = payload.params[0];
                    NonceTrackerSubprovider._validateSender(txParams.from);
                    if (this._addresses.has(txParams.from)) {
                        next();
                        return;
                    }
                    const response = await this._lock.acquire(txParams.from, async () => {
                        return this.sendTx(txParams);
                    });
                    end(null, response.result);
                } catch (err) {
                    end(err);
                }
                return;

            default:
                next();
                return;
        }
    }

    private async sendTx(txParams: PartialTxParams) {
        while (true) {
            const pendingCount = await this._emitGetTransactionCountAsync(txParams.from, 'pending');
            const filledParams = { ...txParams, nonce: pendingCount.result };
            const signedTx = await this._emitSignTransactionAsync(filledParams);
            try {
                return await this._emitSendTransactionAsync(signedTx.result.raw);
            } catch (err) {
                if (txParams.nonce != null || (err.message !== 'nonce too low'
                    && err.message !== 'replacement transaction underpriced')) {
                    throw err;
                }
                // Retry if we didn't get a nonce to begin with and the nonce is too low
            }
        }
    }

    private async _emitGetTransactionCountAsync(from: string, block: string): Promise<JSONRPCResponsePayload> {
        return this.emitPayloadAsync({
            method: 'eth_getTransactionCount',
            params: [from, block],
        });
    }

    private async _emitSignTransactionAsync(filledParams: PartialTxParams): Promise<JSONRPCResponsePayload> {
        return this.emitPayloadAsync({
            method: 'eth_signTransaction',
            params: [filledParams],
        });
    }

    private async _emitSendTransactionAsync(signedTx: string): Promise<JSONRPCResponsePayload> {
        return this.emitPayloadAsync({
            method: 'eth_sendRawTransaction',
            params: [signedTx],
        });
    }

}
