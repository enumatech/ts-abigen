import _ from 'lodash';
import { addressUtils } from '@0xproject/utils';
import { JSONRPCRequestPayload, JSONRPCResponsePayload } from 'ethereum-types';
import { Callback, ErrorCallback, PartialTxParams, WalletSubproviderErrors } from 'sane-subproviders/lib/src/types';
import { Subprovider } from 'sane-subproviders/lib/src/subproviders/subprovider';

export class NonceTrackerSubprovider extends Subprovider {

    // Copied from BaseWalletSubprovider
    private static _validateSender(sender: string): void {
        if (_.isUndefined(sender) || !addressUtils.isAddress(sender)) {
            throw new Error(WalletSubproviderErrors.SenderInvalidOrNotSupplied);
        }
    }

    public async handleRequest(payload: JSONRPCRequestPayload, next: Callback, end: ErrorCallback): Promise<void> {
        let txParams;
        switch (payload.method) {
            case 'eth_sendTransaction':
                txParams = payload.params[0];
                try {
                    NonceTrackerSubprovider._validateSender(txParams.from);
                    while (true) {
                        try {
                            const filledParams = await this._populateMissingTxParamsAsync(txParams);
                            const signedTx = await this._emitSignTransactionAsync(filledParams);
                            const response = await this._emitSendTransactionAsync(signedTx.result.raw);
                            end(null, response.result);
                        } catch (err) {
                            if ((err.message !== 'nonce too low' && err.message !== 'replacement transaction underpriced')
                                || txParams.nonce != null) {
                                throw err;
                            }
                            // Retry if we didn't get a nonce to begin with and the nonce is too low
                        }
                    }
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
        if (partialTxParams.nonce == null) {
            const nonceResult = await this.emitPayloadAsync({
                method: 'eth_getTransactionCount',
                params: [partialTxParams.from, 'pending'],
            });
            const nonce = nonceResult.result;
            txParams = {...txParams, nonce};
        };
        return txParams;
    }

    private async _emitSignTransactionAsync(filledParams: PartialTxParams): Promise<JSONRPCResponsePayload> {
        const payload = {
            method: 'eth_signTransaction',
            params: [filledParams],
        };
        const result = await this.emitPayloadAsync(payload);
        return result;
    }

    private async _emitSendTransactionAsync(signedTx: string): Promise<JSONRPCResponsePayload> {
        const payload = {
            method: 'eth_sendRawTransaction',
            params: [signedTx],
        };
        const result = await this.emitPayloadAsync(payload);
        return result;
    }

}
