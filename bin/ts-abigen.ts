import * as ArgumentParser from 'argparse'
import * as Child from 'child_process'
import * as FSE from 'fs-extra'
import * as Path from 'path'
import * as FS from 'fs'
import * as OS from 'os'

const cwd = __dirname
const root = Path.join(cwd, '..')

const abiGenMeta = JSON.parse(
    FS.readFileSync(
        Path.join(root, 'package.json')).toString())

const parser = new ArgumentParser.ArgumentParser({
    'version': abiGenMeta['version'],
    'addHelp': true,
    description: abiGenMeta['description'],
})
parser.addArgument(
    ['--combined'],
    {
        'required': true,
        'help': 'Comined JSON output from solc',
    })
parser.addArgument(
    ['--out'],
    {
        'required': true,
        'help': 'Module output path',
    })
parser.addArgument(
    ['--name'],
    {
        'required': true,
        'help': 'Name of resulting module (in package.json)',
    })
const args = parser.parseArgs()

// Extract ABI output from solc JSON output
const combinedJson = JSON.parse(FS.readFileSync(args.combined).toString())
const contracts = combinedJson['contracts']
const abiTempDir = FS.mkdtempSync(Path.join(OS.tmpdir(), 'ts-abigen-abi-'))
// @ts-ignore
const abiFiles = Object.keys(contracts).reduce((acc, contract) => {
    const value = contracts[contract]
    const outFile = Path.join(
        abiTempDir,
        contract.split(':')[1] + '.json')
    FS.writeFileSync(outFile, value['abi'])

    acc.push(outFile)
    return acc
}, <string[]>[])

// Create directory temp dir
const modTempDir = FS.mkdtempSync(Path.join(OS.tmpdir(), 'ts-abigen-mod-'))
FSE.copySync(Path.join(root, 'template_project'), modTempDir)
const packageJson = JSON.parse(
    FS.readFileSync(
        Path.join(modTempDir, 'package.json')).toString())
packageJson['name'] = args.name
FS.writeFileSync(Path.join(modTempDir, 'package.json'), JSON.stringify(packageJson))
console.log(modTempDir)

// Generate the module
const templatePath = Path.join(root, 'templates')
const templateArg = Path.join(templatePath, 'contract.handlebars')
const partialArg = Path.join(
    Path.join(templatePath, 'partials'), '*.handlebars')
const child = Child.spawnSync(
    'abi-gen', [
        '--abis', Path.join(abiTempDir, '*.json'),
        // '--out', args.out,
        '--out', Path.join(modTempDir, 'contracts'),
        '--partials', partialArg,
        '--template', templateArg,
    ],
    // @ts-ignore
    {
        // @ts-ignore
        stdio: 'inherit'
    })

// Move result to output
if (child.status == 0) {
    FSE.moveSync(modTempDir, args.out)
}

process.exit(child.status)
