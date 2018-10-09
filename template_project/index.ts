import { TxData } from 'ethereum-types';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
import { RPCSubprovider } from 'sane-subproviders'
// @ts-ignore
import Web3ProviderEngine = require('web3-provider-engine-tiny');
import { OpaqueSignerSubprovider, Signer } from './subproviders/opaque_signer_subprovider';

// CONTRACT_IMPORT_REPLACE

export class RPCClient {
    private readonly _txDefaults: Partial<TxData> = {}
    private readonly _w3: Web3Wrapper
    private readonly _provider: Web3ProviderEngine = undefined
    private readonly _signerSub: OpaqueSignerSubprovider

    constructor(rpcURL?: string, txDefaults?: Partial<TxData>) {
        this._txDefaults = txDefaults || {}

        const provider = this._provider = new Web3ProviderEngine()
        const w3 = this._w3 = new Web3Wrapper(provider, txDefaults)

        const signerSub = this._signerSub = new OpaqueSignerSubprovider()
        provider.addProvider(signerSub)

        if (rpcURL) {
            provider.addProvider(new RPCSubprovider(rpcURL))
        }
        provider.start()
    }

    /**
     * @param address  Ethereum address (with 0x prefix) to add signer for
     * @param signer   Async function that takes care of signing
     */
    public addSigner(address: string, signer: Signer): void {
        this._signerSub.addSigner(address, signer)
    }

    /**
     * @param address  Ethereum address (with 0x prefix) to remove signer for
     */
    public removeSigner(address: string) {
        this._signerSub.removeSigner(address)
    }

    // CONTRACT_METHODS_REPLACE
}
