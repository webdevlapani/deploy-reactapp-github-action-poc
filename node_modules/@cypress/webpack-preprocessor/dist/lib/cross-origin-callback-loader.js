"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var lodash_1 = __importDefault(require("lodash"));
var parser_1 = require("@babel/parser");
var traverse_1 = __importDefault(require("@babel/traverse"));
var generator_1 = __importDefault(require("@babel/generator"));
var core_1 = require("@babel/core");
var loaderUtils = __importStar(require("loader-utils"));
var pathUtil = __importStar(require("path"));
var debug_1 = __importDefault(require("debug"));
var merge_source_map_1 = __importDefault(require("./merge-source-map"));
var cross_origin_callback_store_1 = require("./cross-origin-callback-store");
var utils_1 = __importDefault(require("./utils"));
var debug = (0, debug_1.default)('cypress:webpack');
// this loader makes supporting dependencies within cross-origin callbacks
// possible. if there are no dependencies (e.g. no requires/imports), it's a
// noop. otherwise: it does this by doing the following:
// - extracts the callbacks
//   - the callbacks are kept in memory and then run back through webpack
//     once the initial file compilation is complete
// - replaces the callbacks with objects
//   - this object references the file the callback will be output to by
//     its own compilation. this allows the runtime to get the file and
//     run it in its origin's context.
function default_1(source, map, meta, store) {
    var _a;
    if (store === void 0) { store = cross_origin_callback_store_1.crossOriginCallbackStore; }
    var resourcePath = this.resourcePath;
    var options = typeof this.getOptions === 'function'
        ? this.getOptions() // webpack 5
        : loaderUtils.getOptions(this); // webpack 4
    var commands = (options.commands || []);
    var ast;
    try {
        // purposefully lenient in allowing syntax since the user can't configure
        // this, but probably has their own webpack or target configured to
        // handle it
        ast = (0, parser_1.parse)(source, {
            allowImportExportEverywhere: true,
            allowAwaitOutsideFunction: true,
            allowSuperOutsideMethod: true,
            allowUndeclaredExports: true,
            sourceType: 'unambiguous',
            sourceFilename: resourcePath,
        });
    }
    catch (err) {
        // it's unlikely there will be a parsing error, since that should have
        // already been caught by a previous loader, but if there is and it isn't
        // possible to get the AST, there's nothing we can do, so just callback
        // with the original source
        debug('parsing error for file (%s): %s', resourcePath, err.stack);
        this.callback(null, source, map);
        return;
    }
    var hasDependencies = false;
    (0, traverse_1.default)(ast, {
        CallExpression: function (path) {
            var callee = path.get('callee');
            if (!callee.isMemberExpression())
                return;
            // bail if we're not inside a supported command
            if (!commands.includes(callee.node.property.name)) {
                return;
            }
            var lastArg = lodash_1.default.last(path.get('arguments'));
            // the user could try an invalid signature where the last argument is
            // not a function. in this case, we'll return the unmodified code and
            // it will be a runtime validation error
            if (!lastArg || (!lastArg.isArrowFunctionExpression()
                && !lastArg.isFunctionExpression())) {
                return;
            }
            // determine if there are any requires/imports within the callback
            lastArg.traverse({
                CallExpression: function (path) {
                    if (
                    // e.g. const dep = require('../path/to/dep')
                    // @ts-ignore
                    path.node.callee.name === 'require'
                        // e.g. const dep = await import('../path/to/dep')
                        || path.node.callee.type === 'Import') {
                        hasDependencies = true;
                    }
                },
            }, this);
            if (!hasDependencies)
                return;
            // generate the extracted callback function from an AST into a string
            // and assign it to a variable. we wrap this generated code when we
            // eval the code, so the variable is set up and then invoked. it ends up
            // like this:
            //
            // let __cypressCrossOriginCallback              】added at runtime
            // (function () {                                ┓ added by webpack
            //   // ... webpack stuff stuff ...              ┛
            //   __cypressCrossOriginCallback = (args) => {  ┓ extracted callback
            //     const dep = require('../path/to/dep')     ┃
            //     // ... test stuff ...                     ┃
            //   }                                           ┛
            //   // ... webpack stuff stuff ...              ┓ added by webpack
            // }())                                          ┛
            // __cypressCrossOriginCallback(args)            】added at runtime
            //
            var callbackName = '__cypressCrossOriginCallback';
            var generatedCode = (0, generator_1.default)(lastArg.node, {}).code;
            var modifiedGeneratedCode = "".concat(callbackName, " = ").concat(generatedCode);
            // the tmpdir path uses a hashed version of the source file path
            // so that it can be cleaned up without removing other in-use tmpdirs
            // (notably the support file persists between specs, so its cross-origin
            // callback output files need to persist as well)
            var sourcePathHash = utils_1.default.hash(resourcePath);
            var outputDir = utils_1.default.tmpdir(sourcePathHash);
            // use a hash of the contents in file name to ensure it's unique. if
            // the contents happen to be the same, it's okay if they share a file
            var codeHash = utils_1.default.hash(modifiedGeneratedCode);
            var inputFileName = "cross-origin-cb-".concat(codeHash);
            var outputFilePath = "".concat(pathUtil.join(outputDir, inputFileName), ".js");
            store.addFile(resourcePath, {
                inputFileName: inputFileName,
                outputFilePath: outputFilePath,
                source: modifiedGeneratedCode,
            });
            // replaces callback function with object referencing the extracted
            // function's callback name and output file path in the form
            // { callbackName: <callbackName>, outputFilePath: <outputFilePath> }
            // this is used at runtime when the command is run to execute the bundle
            // generated for the extracted callback function
            lastArg.replaceWith(core_1.types.objectExpression([
                core_1.types.objectProperty(core_1.types.stringLiteral('callbackName'), core_1.types.stringLiteral(callbackName)),
                core_1.types.objectProperty(core_1.types.stringLiteral('outputFilePath'), core_1.types.stringLiteral(outputFilePath)),
            ]));
        },
    });
    // if no requires/imports were found, callback with the original source/map
    if (!hasDependencies) {
        debug('callback with original source');
        this.callback(null, source, map);
        return;
    }
    // if we found requires/imports, re-generate the code from the AST
    var result = (0, generator_1.default)(ast, { sourceMaps: true }, (_a = {},
        _a[resourcePath] = source,
        _a));
    // result.map needs to be merged with the original map for it to include
    // the changes made in this loader. we can't return result.map because it
    // is based off the intermediary code provided to the loader and not the
    // original source code (which could be TypeScript or JSX or something)
    var newMap = (0, merge_source_map_1.default)(map, result.map);
    debug('callback with modified source');
    this.callback(null, result.code, newMap);
}
exports.default = default_1;
