"use strict";
// https://github.com/keik/merge-source-map
//
// The MIT License (MIT)
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// Copyright (c) keik <k4t0.kei@gmail.com>
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
var source_map_1 = __importDefault(require("source-map"));
var SourceMapConsumer = source_map_1.default.SourceMapConsumer;
var SourceMapGenerator = source_map_1.default.SourceMapGenerator;
/**
 * Merge old source map and new source map and return merged.
 * If old or new source map value is falsy, return another one as it is.
 *
 * @param {object|string} [oldMap] old source map object
 * @param {object|string} [newmap] new source map object
 * @return {object|undefined} merged source map object, or undefined when both old and new source map are undefined
 */
function merge(oldMap, newMap) {
    if (!oldMap)
        return newMap;
    if (!newMap)
        return oldMap;
    var oldMapConsumer = new SourceMapConsumer(oldMap);
    var newMapConsumer = new SourceMapConsumer(newMap);
    var mergedMapGenerator = new SourceMapGenerator();
    // iterate on new map and overwrite original position of new map with one of old map
    newMapConsumer.eachMapping(function (m) {
        // pass when `originalLine` is null.
        // It occurs in case that the node does not have origin in original code.
        if (m.originalLine == null)
            return;
        var origPosInOldMap = oldMapConsumer.originalPositionFor({
            line: m.originalLine,
            column: m.originalColumn,
        });
        if (origPosInOldMap.source == null)
            return;
        mergedMapGenerator.addMapping({
            original: {
                line: origPosInOldMap.line,
                column: origPosInOldMap.column,
            },
            generated: {
                line: m.generatedLine,
                column: m.generatedColumn,
            },
            source: origPosInOldMap.source,
            name: origPosInOldMap.name,
        });
    });
    var consumers = [newMapConsumer, oldMapConsumer];
    consumers.forEach(function (consumer) {
        // @ts-ignore
        consumer.sources.forEach(function (sourceFile) {
            // @ts-ignore
            mergedMapGenerator._sources.add(sourceFile);
            var sourceContent = consumer.sourceContentFor(sourceFile);
            if (sourceContent != null) {
                mergedMapGenerator.setSourceContent(sourceFile, sourceContent);
            }
        });
    });
    // @ts-ignore
    mergedMapGenerator._sourceRoot = oldMap.sourceRoot;
    // @ts-ignore
    mergedMapGenerator._file = oldMap.file;
    return JSON.parse(mergedMapGenerator.toString());
}
exports.default = merge;
