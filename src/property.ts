/* --------------------------------------------------------------------------------------------
 * Copyright (c) Remy Suen. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { TextDocument, Range, Position } from 'vscode-languageserver-types';

import { Argument } from './argument';
import { Util } from './util';

export class Property {

    private document: TextDocument;
    private escapeChar: string;
    private readonly range: Range;
    private readonly nameRange: Range;
    private readonly name: string;
    private readonly valueRange: Range | null = null;
    private readonly value: string | null = null;

    constructor(document: TextDocument, escapeChar: string, arg: Argument, arg2?: Argument) {
        this.document = document;
        this.escapeChar = escapeChar;
        this.nameRange = Property.getNameRange(document, arg);
        let value = document.getText().substring(document.offsetAt(this.nameRange.start), document.offsetAt(this.nameRange.end));
        this.name = Property.getValue(value, escapeChar);
        if (arg2) {
            this.valueRange = arg2.getRange();
            value = document.getText().substring(document.offsetAt(this.valueRange.start), document.offsetAt(this.valueRange.end));
            this.value = Property.getValue(value, escapeChar);
            this.range = Range.create(this.nameRange.start, this.valueRange.end);
        } else {
            let argRange = arg.getRange();
            if (this.nameRange.start.line === argRange.start.line
                && this.nameRange.start.character === argRange.start.character
                && this.nameRange.end.line === argRange.end.line
                && this.nameRange.end.character === argRange.end.character) {
            } else {
                this.valueRange = Property.getValueRange(document, arg);
                value = document.getText().substring(document.offsetAt(this.valueRange.start), document.offsetAt(this.valueRange.end));
                this.value = Property.getValue(value, escapeChar);
            }
            this.range = argRange;
        }
    }

    public getRange(): Range {
        return this.range;
    }

    public getName(): string {
        return this.name;
    }

    public getNameRange(): Range {
        return this.nameRange;
    }

    public getValue(): string | null {
        return this.value;
    }

    public getValueRange(): Range | null {
        return this.valueRange;
    }

    /**
     * Returns the value of this property including any enclosing
     * single or double quotes and relevant escape characters.
     * Escaped newlines and its associated contiguous whitespace
     * characters however will not be returned as they are deemed to
     * be uninteresting to clients trying to return a Dockerfile.
     * 
     * @return the unescaped value of this property or null if this
     *         property has no associated value
     */
    public getUnescapedValue(): string | null {
        if (this.valueRange === null) {
            return null;
        }

        let escaped = false;
        let rawValue = "";
        let value = this.document.getText().substring(this.document.offsetAt(this.valueRange.start), this.document.offsetAt(this.valueRange.end));
        rawLoop: for (let i = 0; i < value.length; i++) {
            let char = value.charAt(i);
            switch (char) {
                case this.escapeChar:
                    for (let j = i + 1; j < value.length; j++) {
                        switch (value.charAt(j)) {
                            case '\r':
                                j++;
                            case '\n':
                                escaped = true;
                                i = j;
                                continue rawLoop;
                            case ' ':
                            case '\t':
                                break;
                            default:
                                rawValue = rawValue + char;
                                continue rawLoop;
                        }
                    }
                    // this happens if there's only whitespace after the escape character
                    rawValue = rawValue + char;
                    break;
                case '\r':
                case '\n':
                    break;
                case ' ':
                case '\t':
                    if (!escaped) {
                        rawValue = rawValue + char;
                    }
                    break;
                case '#':
                    if (escaped) {
                        for (let j = i + 1; j < value.length; j++) {
                            switch (value.charAt(j)) {
                                case '\r':
                                    j++;
                                case '\n':
                                    i = j;
                                    continue rawLoop;
                            }
                        }
                    } else {
                        rawValue = rawValue + char;
                    }
                    break;
                default:
                    rawValue = rawValue + char;
                    escaped = false;
                    break;
            }
        }
        return rawValue;
    }

    private static getNameRange(document: TextDocument, arg: Argument): Range {
        let value = arg.getValue();
        let index = value.indexOf('=');
        if (index !== -1) {
            let initial = value.charAt(0);
            let before = value.charAt(index - 1);
            // check if content before the equals sign are in quotes
            // "var"=value
            // 'var'=value
            // otherwise, just assume it's a standard definition
            // var=value
            if ((initial === '"' && before === '"') || (initial === '\'' && before === '\'') || (initial !== '"' && initial !== '\'')) {
                return Range.create(arg.getRange().start, document.positionAt(document.offsetAt(arg.getRange().start) + index));
            }
        }
        // no '=' found, just defined the ARG's name
        return arg.getRange();
    }

    private static getValueRange(document: TextDocument, arg: Argument): Range {
        return Range.create(
            document.positionAt(document.offsetAt(arg.getRange().start) + arg.getValue().indexOf('=') + 1),
            document.positionAt(document.offsetAt(arg.getRange().end))
        );
    }

    /**
     * Returns the actual value of this instruction's declared
     * variable. The value will have its escape characters removed if
     * applicable. If the value spans multiple lines and there are
     * comments nested within the lines, they too will be removed.
     * 
     * @return the value that this ARG instruction's declared
     *         variable will resolve to, may be null if no value is
     *         defined, may be the empty string if the value only
     *         consists of whitespace
     */
    private static getValue(value: string, escapeChar: string): string {
        let escaped = false;
        const skip = Util.findLeadingNonWhitespace(value, escapeChar);
        if (skip !== 0 && value.charAt(skip) === '#') {
            // need to skip over comments
            escaped = true;
        }
        value = value.substring(skip);
        let first = value.charAt(0);
        let last = value.charAt(value.length - 1);
        let literal = first === '\'' || first === '"';
        let inSingle = (first === '\'' && last === '\'');
        let inDouble = false;
        if (first === '"') {
            for (let i = 1; i < value.length; i++) {
                if (value.charAt(i) === escapeChar) {
                    i++;
                } else if (value.charAt(i) === '"' && i === value.length - 1) {
                    inDouble = true;
                }
            }
        }
        if (inSingle || inDouble) {
            value = value.substring(1, value.length - 1);
        }

        let commentCheck = -1;
        let escapedValue = "";
        let start = 0;
        parseValue: for (let i = 0; i < value.length; i++) {
            let char = value.charAt(i);
            switch (char) {
                case escapeChar:
                    if (i + 1 === value.length) {
                        escapedValue = escapedValue + escapeChar;
                        break parseValue;
                    }

                    char = value.charAt(i + 1);
                    if (char === ' ' || char === '\t') {
                        whitespaceCheck: for (let j = i + 2; j < value.length; j++) {
                            let char2 = value.charAt(j);
                            switch (char2) {
                                case ' ':
                                case '\t':
                                    break;
                                case '\r':
                                    j++;
                                case '\n':
                                    escaped = true;
                                    i = j;
                                    continue parseValue;
                                default:
                                    if (!inDouble && !inSingle && !literal) {
                                        if (char2 === escapeChar) {
                                            // add the escaped character
                                            escapedValue = escapedValue + char
                                            // now start parsing from the next escape character
                                            i = i + 1;
                                        } else {
                                            // the expectation is that this j = i + 2 here
                                            escapedValue = escapedValue + char + char2;
                                            i = j;
                                        }
                                        continue parseValue;
                                    }
                                    break whitespaceCheck;
                            }
                        }
                    }
                    if (inDouble) {
                        if (char === '\r') {
                            escaped = true;
                            i = i + 2;
                        } else if (char === '\n') {
                            escaped = true;
                            i++;
                        } else if (char !== '"') {
                            if (char === escapeChar) {
                                i++;
                            }
                            escapedValue = escapedValue + escapeChar;
                        }
                        continue parseValue;
                    } else if (inSingle || literal) {
                        if (char === '\r') {
                            escaped = true;
                            i = i + 2;
                        } else if (char === '\n') {
                            escaped = true;
                            i++;
                        } else {
                            escapedValue = escapedValue + escapeChar;
                        }
                        continue parseValue;
                    } else if (char === escapeChar) {
                        // double escape, append one and move on
                        escapedValue = escapedValue + escapeChar;
                        i++;
                    } else if (char === '\r') {
                        escaped = true;
                        // offset one more for \r\n
                        i = i + 2;
                    } else if (char === '\n') {
                        escaped = true;
                        i++;
                        start = i;
                    } else {
                        // any other escapes are simply ignored
                        escapedValue = escapedValue + char;
                        i++;
                    }
                    break;
                case ' ':
                case '\t':
                    if (escaped && commentCheck === -1) {
                        commentCheck = i;
                    }
                    escapedValue = escapedValue + char;
                    break;
                case '\r':
                    i++;
                case '\n':
                    if (escaped && commentCheck !== -1) {
                        // rollback and remove the whitespace that was previously appended
                        escapedValue = escapedValue.substring(0, escapedValue.length - (i - commentCheck - 1));
                        commentCheck = -1;
                    }
                    break;
                case '#':
                    // a newline was escaped and now there's a comment
                    if (escaped) {
                        if (commentCheck !== -1) {
                            // rollback and remove the whitespace that was previously appended
                            escapedValue = escapedValue.substring(0, escapedValue.length - (i - commentCheck));
                            commentCheck = -1;
                        }

                        newlineCheck: for (let j = i + 1; j < value.length; j++) {
                            switch (value.charAt(j)) {
                                case '\r':
                                    j++;
                                case '\n':
                                    i = j;
                                    break newlineCheck;
                            }
                        }
                        continue parseValue;
                    }
                default:
                    if (escaped) {
                        escaped = false;
                        commentCheck = -1;
                    }
                    escapedValue = escapedValue + char;
                    break;
            }
        }

        return escapedValue;
    }
}
