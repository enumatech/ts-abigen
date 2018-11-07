import { TxData } from 'ethereum-types';
import { Web3Wrapper } from '@0xproject/web3-wrapper';
import { Subprovider } from 'sane-subproviders'
// @ts-ignore
import Web3ProviderEngine = require('web3-provider-engine-tiny');

// CONTRACT_IMPORT_REPLACE

export class RPCClient {
    private readonly _txDefaults: Partial<TxData>
    private readonly _w3: Web3Wrapper
    private readonly _provider: Web3ProviderEngine

    /**
     * Constructor.
     * @param txDefaults Default to use for all transactions
     */
    constructor(txDefaults: Partial<TxData>) {
        this._txDefaults = txDefaults || {}

        const provider = this._provider = new Web3ProviderEngine()
        this._w3 = new Web3Wrapper(provider, txDefaults)
    }

    /**
     * Add a subprovider to the provider engine.
     * @param sub The Subprovider to add to the provider engine
     */
    addProvider(sub: Subprovider) {
        this._provider.addProvider(sub)
    }

    /**
     * Start the provider engine.
     */
    start() {
        this._provider.start()
    }

    /**
     * @returns Reference to the internal Web3Wrapper
     */
    w3() {
        return this._w3
    }

    // CONTRACT_METHODS_REPLACE
}
