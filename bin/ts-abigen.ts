#!/usr/bin/env node
import * as ArgumentParser from 'argparse'
import * as Child from 'child_process'
import * as TS from 'typescript'
import * as FSE from 'fs-extra'
import * as Path from 'path'
import * as FS from 'fs'
import * as OS from 'os'

const camelCase = require('camelcase')

const cwd = __dirname
const root = Path.join(cwd, '..')

const abiGenMeta = JSON.parse(
    FS.readFileSync(
        Path.join(root, 'package.json')).toString())

function findFilesRecursive(dirname: string, _acc?: string[]) {
  if (_acc === undefined) {
    _acc = []
  }

  FS.readdirSync(dirname).map(fname => {
    const fullPath = Path.join(dirname, fname)

    if (FS.statSync(fullPath).isDirectory()) {
      findFilesRecursive(fullPath, _acc)
    } else {
      _acc!.push(fullPath)
    }
  })

  return _acc
}

const parser = new ArgumentParser.ArgumentParser({
  'version': abiGenMeta['version'],
  'addHelp': true,
  description: abiGenMeta['description'],
})
parser.addArgument(
  ['--combined'],
  {
    'required': true,
    'help': 'Comined JSON output from solc.',
  })
parser.addArgument(
  ['--out'],
  {
    'required': true,
    'help': 'Module output path.',
  })
parser.addArgument(
  ['--name'],
  {
    'required': true,
    'help': 'Name of resulting module (in package.json).',
  })
parser.addArgument(
  ['--only-ts'],
  {
    'required': false,
    'action': 'storeTrue',
    'help': [
      'Only move contract interfaces to output directory.',
      'This is useful if you want to drop interfaces into an existing project.',
    ].join('\n'),
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
Child.spawnSync('chmod', ['-R', '+w', modTempDir])
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
const contractMethodsStrings: string[] = []
FS.readdirSync(contractsTempDir).filter(fname => (/\.ts$/).test(fname)).forEach(filename => {
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
      const importFrom = ['./contracts', filename.replace(/\.ts/, '')].join('/')
      exportStrings.push(`import {${className}} from "${importFrom}"`)

      const classNameCamel = camelCase(className)
      contractMethodsStrings.push(`
        public ${classNameCamel}At(address: string): ${className} {
          return new ${className}(address, this._w3.getProvider(), this._w3.getContractDefaults())
        }`)
      break
    }
  })
})
const indexTS = Path.join(modTempDir, 'index.ts')
const indexTSContents = FS.readFileSync(indexTS).toString()
      .replace('// CONTRACT_METHODS_REPLACE', contractMethodsStrings.join(''))
      .replace('// CONTRACT_IMPORT_REPLACE', exportStrings.join('\n') + '\n')
FS.writeFileSync(indexTS, indexTSContents)

// Locate typescript type information required to compile interfaces
const tsConfig = JSON.parse(FS.readFileSync(Path.join(modTempDir, 'tsconfig.json')).toString())
// @ts-ignore
tsConfig.typeRoots = [].concat.apply([], require.resolve.paths('').map((path: string) => {
  return [
    Path.join(path, '@0xproject/typescript-typings/types'),
    Path.join(path, '@types'),
  ]
})).filter((path: string) => FS.existsSync(path))

// Compile all typescript files
const tsFiles = findFilesRecursive(modTempDir).filter(fname => (/\.ts$/).test(fname))
let program = TS.createProgram(tsFiles, tsConfig.compilerOptions)
let emitResult = program.emit()
if (emitResult.emitSkipped) {
  console.error(emitResult)
  process.exit(1)
}

// Delete all intermediate build files
FS.unlinkSync(Path.join(modTempDir, 'tsconfig.json'))
tsFiles.forEach(filePath => {
  FS.unlinkSync(filePath)
})

FS.readdirSync(modTempDir).filter(filename => {
  FSE.moveSync(Path.join(modTempDir, filename), Path.join(args.out, filename), {
    'overwrite': true,
  })
})

const finalDestination = FS.realpathSync(args.out)
console.log(`\nModule path: ${finalDestination}`)
console.log('done')
