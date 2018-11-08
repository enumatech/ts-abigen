#!/usr/bin/env node
"use strict";
exports.__esModule = true;
var ArgumentParser = require("argparse");
var Child = require("child_process");
var TS = require("typescript");
var FSE = require("fs-extra");
var Path = require("path");
var FS = require("fs");
var OS = require("os");
var camelCase = require('camelcase');
var cwd = __dirname;
var root = Path.join(cwd, '..');
var abiGenMeta = JSON.parse(FS.readFileSync(Path.join(root, 'package.json')).toString());
function findFilesRecursive(dirname, _acc) {
    if (_acc === undefined) {
        _acc = [];
    }
    FS.readdirSync(dirname).map(function (fname) {
        var fullPath = Path.join(dirname, fname);
        if (FS.statSync(fullPath).isDirectory()) {
            findFilesRecursive(fullPath, _acc);
        }
        else {
            _acc.push(fullPath);
        }
    });
    return _acc;
}
var parser = new ArgumentParser.ArgumentParser({
    'version': abiGenMeta['version'],
    'addHelp': true,
    description: abiGenMeta['description']
});
parser.addArgument(['--combined'], {
    'required': true,
    'help': 'Comined JSON output from solc.'
});
parser.addArgument(['--out'], {
    'required': true,
    'help': 'Module output path.'
});
parser.addArgument(['--name'], {
    'required': false,
    'help': 'Name of resulting module (in package.json).'
});
parser.addArgument(['--only-ts'], {
    'required': false,
    'action': 'storeTrue',
    'help': [
        'Only move contract interfaces to output directory.',
        'This is useful if you want to drop interfaces into an existing project.',
    ].join('\n')
});
var args = parser.parseArgs();
// Extract ABI output from solc JSON output
var combinedJson = JSON.parse(FS.readFileSync(args.combined).toString());
var contracts = combinedJson['contracts'];
var abiTempDir = FS.mkdtempSync(Path.join(OS.tmpdir(), 'ts-abigen-abi-'));
// @ts-ignore
var abiFiles = Object.keys(contracts).reduce(function (acc, contract) {
    var value = contracts[contract];
    var outFile = Path.join(abiTempDir, contract.split(':')[1] + '.json');
    FS.writeFileSync(outFile, value['abi']);
    acc.push(outFile);
    return acc;
}, []);
// Create directory temp dir
var modTempDir = FS.mkdtempSync(Path.join(OS.tmpdir(), 'ts-abigen-mod-'));
FSE.copySync(Path.join(root, 'template_project'), modTempDir);
Child.spawnSync('chmod', ['-R', '+w', modTempDir]);
var packageJson = JSON.parse(FS.readFileSync(Path.join(modTempDir, 'package.json')).toString());
packageJson['name'] = args.name || Path.basename(args.out);
FS.writeFileSync(Path.join(modTempDir, 'package.json'), JSON.stringify(packageJson, null, 2));
// Generate the module
var contractsTempDir = Path.join(modTempDir, 'contracts');
var templatePath = Path.join(root, 'templates');
var templateArg = Path.join(templatePath, 'contract.handlebars');
var partialArg = Path.join(Path.join(templatePath, 'partials'), '*.handlebars');
// In-place modify process.argv to "wrap" abi-gen, otherwise we need abi-gen in $PATH
process.argv = [
    // Emulate a call
    process.argv[0], 'abi-gen',
    // Actual args
    '--abis', Path.join(abiTempDir, '*.json'),
    '--out', contractsTempDir,
    '--partials', partialArg,
    '--template', templateArg,
];
// Do the "call"
require('@0xproject/abi-gen');
// Generate top-level index.ts re-exporting all contracts
var exportStrings = [];
var contractMethodsStrings = [];
FS.readdirSync(contractsTempDir).filter(function (fname) { return (/\.ts$/).test(fname); }).forEach(function (filename) {
    var contractFile = Path.join(contractsTempDir, filename);
    var sourceFile = TS.createSourceFile(contractFile, FS.readFileSync(contractFile).toString(), TS.ScriptTarget.ES2015, true);
    TS.forEachChild(sourceFile, function (node) {
        switch (node.kind) {
            case TS.SyntaxKind.ClassDeclaration:
                // @ts-ignore
                var className = node.name.escapedText;
                var importFrom = ['./contracts', filename.replace(/\.ts/, '')].join('/');
                exportStrings.push("import {" + className + "} from \"" + importFrom + "\"");
                var classNameCamel = camelCase(className);
                contractMethodsStrings.push("\n        public " + classNameCamel + "At(address: string): " + className + " {\n          return new " + className + "(address, this._w3.getProvider(), this._w3.getContractDefaults())\n        }");
                break;
        }
    });
});
var indexTS = Path.join(modTempDir, 'index.ts');
var indexTSContents = FS.readFileSync(indexTS).toString()
    .replace('// CONTRACT_METHODS_REPLACE', contractMethodsStrings.join(''))
    .replace('// CONTRACT_IMPORT_REPLACE', exportStrings.join('\n') + '\n');
FS.writeFileSync(indexTS, indexTSContents);
// Locate typescript type information required to compile interfaces
var tsConfig = JSON.parse(FS.readFileSync(Path.join(modTempDir, 'tsconfig.json')).toString());
// @ts-ignore
tsConfig.typeRoots = [].concat.apply([], require.resolve.paths('').map(function (path) {
    return [
        Path.join(path, '@0xproject/typescript-typings/types'),
        Path.join(path, '@types'),
    ];
})).filter(function (path) { return FS.existsSync(path); });
if (!args.only_ts) {
    // Compile all typescript files
    var tsFiles = findFilesRecursive(modTempDir).filter(function (fname) { return (/\.ts$/).test(fname); });
    var program = TS.createProgram(tsFiles, tsConfig.compilerOptions);
    var emitResult = program.emit();
    if (emitResult.emitSkipped) {
        console.error(emitResult);
        process.exit(1);
    }
    // Delete all intermediate build files
    FS.unlinkSync(Path.join(modTempDir, 'tsconfig.json'));
    tsFiles.forEach(function (filePath) {
        FS.unlinkSync(filePath);
    });
}
FS.readdirSync(modTempDir).filter(function (filename) {
    FSE.moveSync(Path.join(modTempDir, filename), Path.join(args.out, filename), {
        'overwrite': true
    });
});
var finalDestination = FS.realpathSync(args.out);
console.log("\nModule path: " + finalDestination);
console.log('done');
