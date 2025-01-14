/* --------------------------------------------------------------------------------------------
 * Copyright (c) Remy Suen. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import { TextDocument, Range, Position } from 'vscode-languageserver-types';
import { Comment } from './comment';
import { ParserDirective } from './parserDirective';
import { Instruction } from './instruction';
import { Line } from './line';
import { JSONInstruction } from './jsonInstruction';
import { Add } from './instructions/add';
import { Arg } from './instructions/arg';
import { Cmd } from './instructions/cmd';
import { Copy } from './instructions/copy';
import { Env } from './instructions/env';
import { Entrypoint } from './instructions/entrypoint';
import { From } from './instructions/from';
import { Healthcheck } from './instructions/healthcheck';
import { Label } from './instructions/label';
import { Onbuild } from './instructions/onbuild';
import { Shell } from './instructions/shell';
import { Stopsignal } from './instructions/stopsignal';
import { Workdir } from './instructions/workdir';
import { User } from './instructions/user';
import { Volume } from './instructions/volume';
import { Dockerfile } from './dockerfile';
import { Directive } from './main';

export class Parser {

    private escapeChar: string;

    public static createInstruction(document: TextDocument, dockerfile: Dockerfile, escapeChar: string, lineRange: Range, instruction: string, instructionRange: Range) {
        switch (instruction.toUpperCase()) {
            case "ADD":
                return new Add(document, lineRange, dockerfile, escapeChar, instruction, instructionRange);
            case "ARG":
                return new Arg(document, lineRange, dockerfile, escapeChar, instruction, instructionRange);
            case "CMD":
                return new Cmd(document, lineRange, dockerfile, escapeChar, instruction, instructionRange);
            case "COPY":
                return new Copy(document, lineRange, dockerfile, escapeChar, instruction, instructionRange);
            case "ENTRYPOINT":
                return new Entrypoint(document, lineRange, dockerfile, escapeChar, instruction, instructionRange);
            case "ENV":
                return new Env(document, lineRange, dockerfile, escapeChar, instruction, instructionRange);
            case "FROM":
                return new From(document, lineRange, dockerfile, escapeChar, instruction, instructionRange);
            case "HEALTHCHECK":
                return new Healthcheck(document, lineRange, dockerfile, escapeChar, instruction, instructionRange);
            case "LABEL":
                return new Label(document, lineRange, dockerfile, escapeChar, instruction, instructionRange);
            case "ONBUILD":
                return new Onbuild(document, lineRange, dockerfile, escapeChar, instruction, instructionRange);
            case "RUN":
                return new JSONInstruction(document, lineRange, dockerfile, escapeChar, instruction, instructionRange);
            case "SHELL":
                return new Shell(document, lineRange, dockerfile, escapeChar, instruction, instructionRange);
            case "STOPSIGNAL":
                return new Stopsignal(document, lineRange, dockerfile, escapeChar, instruction, instructionRange);
            case "WORKDIR":
                return new Workdir(document, lineRange, dockerfile, escapeChar, instruction, instructionRange);
            case "USER":
                return new User(document, lineRange, dockerfile, escapeChar, instruction, instructionRange);
            case "VOLUME":
                return new Volume(document, lineRange, dockerfile, escapeChar, instruction, instructionRange);
        }
        return new Instruction(document, lineRange, dockerfile, escapeChar, instruction, instructionRange);
    }

    private getDirectiveSymbol(document: TextDocument, buffer: string): Line | null {
        // reset the escape directive in between runs
        this.escapeChar = '';
        directiveCheck: for (let i = 0; i < buffer.length; i++) {
            switch (buffer.charAt(i)) {
                case ' ':
                case '\t':
                    break;
                case '\r':
                case '\n':
                    // parser directives must be at the top of the Dockerfile
                    break directiveCheck;
                case '#':
                    let commentStart = i;
                    let directiveStart = -1;
                    let directiveEnd = -1;
                    for (let j = i + 1; j < buffer.length; j++) {
                        let char = buffer.charAt(j);
                        switch (char) {
                            case ' ':
                            case '\t':
                                if (directiveStart !== -1 && directiveEnd === -1) {
                                    directiveEnd = j;
                                }
                                break;
                            case '\r':
                            case '\n':
                                return new Comment(document, Range.create(document.positionAt(commentStart), document.positionAt(j)));
                            case '=':
                                let valueStart = -1;
                                let valueEnd = -1;
                                if (directiveEnd === -1) {
                                    directiveEnd = j;
                                }
                                // assume the line ends with the file
                                let lineEnd = buffer.length;
                                directiveValue: for (let k = j + 1; k < buffer.length; k++) {
                                    char = buffer.charAt(k);
                                    switch (char) {
                                        case '\r':
                                        case '\n':
                                            if (valueStart !== -1 && valueEnd === -1) {
                                                valueEnd = k;
                                            }
                                            // line break found, reset
                                            lineEnd = k;
                                            break directiveValue;
                                        case '\t':
                                        case ' ':
                                            if (valueStart !== -1 && valueEnd === -1) {
                                                valueEnd = k;
                                            }
                                            continue;
                                        default:
                                            if (valueStart === -1) {
                                                valueStart = k;
                                            }
                                            break;
                                    }
                                }

                                let lineRange = Range.create(document.positionAt(commentStart), document.positionAt(lineEnd));
                                if (directiveStart === -1) {
                                    // no directive, it's a regular comment
                                    return new Comment(document, lineRange);
                                }

                                if (valueStart === -1) {
                                    // no non-whitespace characters found, highlight all the characters then
                                    valueStart = j + 1;
                                    valueEnd = lineEnd;
                                } else if (valueEnd === -1) {
                                    // reached EOF
                                    valueEnd = buffer.length;
                                }

                                let nameRange = Range.create(document.positionAt(directiveStart), document.positionAt(directiveEnd));
                                let valueRange = Range.create(document.positionAt(valueStart), document.positionAt(valueEnd));
                                return new ParserDirective(document, lineRange, nameRange, valueRange);
                            default:
                                if (directiveStart === -1) {
                                    directiveStart = j;
                                }
                                break;
                        }
                    }
                    break;
                default:
                    break directiveCheck;
            }
        }
        return null;
    }

    public parse(buffer: string): Dockerfile {
        let document = TextDocument.create("", "", 0, buffer);
        let dockerfile = new Dockerfile(document);
        let line: any = this.getDirectiveSymbol(document, buffer);
        let offset = 0;
        this.escapeChar = '\\';
        if (line instanceof ParserDirective) {
            let directive = line as ParserDirective;
            dockerfile.setDirective(directive);
            if (Directive.escape === directive.getDirective()) {
                let value = directive.getValue();
                if (value === '`' || value === '\\') {
                    this.escapeChar = value;
                }
            }
            offset = document.offsetAt(line.getRange().end);
        } else if (line instanceof Comment) {
            dockerfile.addComment(line);
            // skip the first line
            offset = document.offsetAt(Position.create(1, 0));
        }

        lineCheck: for (let i = offset; i < buffer.length; i++) {
            let char = buffer.charAt(i);
            switch (char) {
                case ' ':
                case '\t':
                case '\r':
                case '\n':
                    break;
                case '#':
                    for (let j = i + 1; j < buffer.length; j++) {
                        char = buffer.charAt(j);
                        switch (char) {
                            case '\r':
                                dockerfile.addComment(new Comment(document, Range.create(document.positionAt(i), document.positionAt(j))));
                                // offset one more for \r\n
                                i = j + 1;
                                continue lineCheck;
                            case '\n':
                                dockerfile.addComment(new Comment(document, Range.create(document.positionAt(i), document.positionAt(j))));
                                i = j;
                                continue lineCheck;
                        }
                    }
                    // reached EOF
                    let range = Range.create(document.positionAt(i), document.positionAt(buffer.length));
                    dockerfile.addComment(new Comment(document, range));
                    break lineCheck;
                default:
                    let instruction = char;
                    let instructionStart = i;
                    let instructionEnd = -1;
                    let lineRange: Range | null = null;
                    let instructionRange: Range | null = null;
                    instructionCheck: for (let j = i + 1; j < buffer.length; j++) {
                        char = buffer.charAt(j);
                        switch (char) {
                            case this.escapeChar:
                                char = buffer.charAt(j + 1);
                                if (char === '\r') {
                                    // skip two for \r\n
                                    j += 2;
                                } else if (char === '\n') {
                                    j++;
                                } else if (char === ' ' || char === '\t') {
                                    for (let k = j + 2; k < buffer.length; k++) {
                                        switch (buffer.charAt(k)) {
                                            case ' ':
                                            case '\t':
                                                break;
                                            case '\r':
                                                // skip another for \r\n
                                                j = k + 1;
                                                continue instructionCheck;
                                            case '\n':
                                                j = k;
                                                continue instructionCheck;
                                            default:
                                                instructionEnd = j + 1;
                                                instruction = instruction + this.escapeChar;
                                                j = k - 2;
                                                continue instructionCheck;
                                        }
                                    }
                                    instructionEnd = j + 1;
                                    instruction = instruction + this.escapeChar;
                                    break instructionCheck;
                                } else {
                                    instructionEnd = j + 1;
                                    instruction = instruction + this.escapeChar;
                                }
                                break;
                            case ' ':
                            case '\t':
                                if (instructionEnd === -1) {
                                    instructionEnd = j;
                                }

                                let escaped = false;
                                argumentsCheck: for (let k = j + 1; k < buffer.length; k++) {
                                    switch (buffer.charAt(k)) {
                                        case '\r':
                                        case '\n':
                                            if (escaped) {
                                                continue;
                                            }
                                            i = k;
                                            lineRange = Range.create(document.positionAt(instructionStart), document.positionAt(k));
                                            instructionRange = Range.create(document.positionAt(instructionStart), document.positionAt(instructionEnd));
                                            dockerfile.addInstruction(Parser.createInstruction(document, dockerfile, this.escapeChar, lineRange, instruction, instructionRange));
                                            continue lineCheck;
                                        case this.escapeChar:
                                            let next = buffer.charAt(k + 1);
                                            if (next === '\n') {
                                                escaped = true;
                                                k++;
                                            } else if (next === '\r') {
                                                escaped = true;
                                                // skip two chars for \r\n
                                                k = k + 2;
                                            } else if (next === ' ' || next === '\t') {
                                                escapeCheck: for (let l = k + 2; l < buffer.length; l++) {
                                                    switch (buffer.charAt(l)) {
                                                        case ' ':
                                                        case '\t':
                                                            break;
                                                        case '\r':
                                                            // skip another char for \r\n
                                                            escaped = true;
                                                            k = l + 1;
                                                            break escapeCheck;
                                                        case '\n':
                                                            escaped = true;
                                                            k = l;
                                                            break escapeCheck;
                                                        default:
                                                            k = l;
                                                            break escapeCheck;
                                                    }
                                                }
                                            }
                                            continue;
                                        case '#':
                                            if (escaped) {
                                                for (let l = k + 1; l < buffer.length; l++) {
                                                    switch (buffer.charAt(l)) {
                                                        case '\r':
                                                            dockerfile.addComment(new Comment(document, Range.create(document.positionAt(k), document.positionAt(l))));
                                                            // offset one more for \r\n
                                                            k = l + 1;
                                                            continue argumentsCheck;
                                                        case '\n':
                                                            let range = Range.create(document.positionAt(k), document.positionAt(l));
                                                            dockerfile.addComment(new Comment(document, range));
                                                            k = l;
                                                            continue argumentsCheck;
                                                    }
                                                }

                                                let range = Range.create(document.positionAt(k), document.positionAt(buffer.length));
                                                dockerfile.addComment(new Comment(document, range));
                                                break argumentsCheck;
                                            }
                                            break;
                                        case ' ':
                                        case '\t':
                                            break;
                                        default:
                                            if (escaped) {
                                                escaped = false;
                                            }
                                            break;
                                    }
                                }
                                // reached EOF
                                lineRange = Range.create(document.positionAt(instructionStart), document.positionAt(buffer.length));
                                instructionRange = Range.create(document.positionAt(instructionStart), document.positionAt(instructionEnd));
                                dockerfile.addInstruction(Parser.createInstruction(document, dockerfile, this.escapeChar, lineRange, instruction, instructionRange));
                                break lineCheck;
                            case '\r':
                                if (instructionEnd === -1) {
                                    instructionEnd = j;
                                }
                                // skip for \r\n
                                j++;
                            case '\n':
                                if (instructionEnd === -1) {
                                    instructionEnd = j;
                                }
                                lineRange = Range.create(document.positionAt(instructionStart), document.positionAt(instructionEnd));
                                dockerfile.addInstruction(Parser.createInstruction(document, dockerfile, this.escapeChar, lineRange, instruction, lineRange));
                                i = j;
                                continue lineCheck;
                            default:
                                instructionEnd = j + 1;
                                instruction = instruction + char;
                                break;
                        }
                    }
                    // reached EOF
                    if (instructionEnd === -1) {
                        instructionEnd = buffer.length;
                    }
                    lineRange = Range.create(document.positionAt(instructionStart), document.positionAt(instructionEnd));
                    dockerfile.addInstruction(Parser.createInstruction(document, dockerfile, this.escapeChar, lineRange, instruction, lineRange));
                    break lineCheck;
            }
        }

        dockerfile.organizeComments();

        return dockerfile;
    }

}
