#!/usr/bin/env node
import * as ArgumentParser from 'argparse'
import * as Child from 'child_process'
import * as TS from 'typescript'
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

// Generate the module
const contractsTempDir = Path.join(modTempDir, 'contracts')
const templatePath = Path.join(root, 'templates')
const templateArg = Path.join(templatePath, 'contract.handlebars')
const partialArg = Path.join(
  Path.join(templatePath, 'partials'), '*.handlebars')
// In-place modify process.argv to "wrap" abi-gen, otherwise we need abi-gen in $PATH
process.argv = [
  // Emulate a call
  process.argv[0], 'abi-gen',
  // Actual args
  '--abis', Path.join(abiTempDir, '*.json'),
  '--out', contractsTempDir,
  '--partials', partialArg,
  '--template', templateArg,
]
// Do the "call"
require('@0xproject/abi-gen')

// Generate top-level index.ts re-exporting all contracts
const exportStrings: string[] = []
FS.readdirSync(contractsTempDir).forEach(filename => {
    if (!(/\.ts$/).test(filename)) {
        return
    }

    const contractFile = Path.join(contractsTempDir, filename)
    const sourceFile = TS.createSourceFile(
        contractFile,
        FS.readFileSync(contractFile).toString(),
        TS.ScriptTarget.ES2015,
        true, // setParentNodes
    )

    TS.forEachChild(sourceFile, node => {
        switch (node.kind) {
            case TS.SyntaxKind.ClassDeclaration:
                // @ts-ignore
                const className = node.name.escapedText
                exportStrings.push(`export {${className}} from "${filename}"`)
                break
        }
    })
})
FS.writeFileSync(Path.join(modTempDir, 'index.ts'), exportStrings.join('\n') + '\n')

// Move result to output
FSE.moveSync(modTempDir, args.out)

const finalDestination = FS.realpathSync(args.out)
console.log(`\nModule path: ${finalDestination}`)
