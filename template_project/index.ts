import {
    RPCSubprovider,
    Web3ProviderEngine,
} from 'sane-subproviders'
import { Web3Wrapper } from '@0xproject/web3-wrapper';

import { RevokeListContract } from './api/revoke_list';

const provider = new Web3ProviderEngine()
provider.addProvider(new RPCSubprovider('http://localhost:8545'))
provider.start()

const w3 = new Web3Wrapper(provider)

const contract = new RevokeListContract(
    '0x48624beaad14ea386e2185839aa10c1faf6b973a',
    w3.getProvider(),
    w3.getContractDefaults())

Promise.resolve()
    .then(async () => {
        const z = '0x0000000000000000000000000000000000000000000000000000000000000000'
        const result = await contract.sanityCheck.call(z, z)
        console.log(result)
    })
    .then(_ => {
        process.exit(0)
    })
    .catch(err => {
        console.error(err)
        process.exit(1)
    })
