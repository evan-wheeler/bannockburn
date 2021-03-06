"use strict";

var _ = require("lodash");

function Lexer(code, options) {
    options = options || {};
    this.setInput(code || "");
}

module.exports = Lexer;

var VARIABLE = 1,
    LINE_COMMENT = 2,
    BLOCK_COMMENT = 3,
    SINGLE_STR = 4,
    DOUBLE_STR = 5,
    NUMBER_NO_DECIMAL = 6,
    NUMBER_DECIMAL = 7,
    ELLIPSIS = 8,
    OBJ_LITERAL = 9,
    WHITESPACE = 10;

function makeToken(t, v, line, from, to, colFrom, colTo, extra) {
    var obj = {
        type: t,
        value: v,
        range: [from, to],
        loc: {
            start: { line: line, col: colFrom },
            end: { line: line, col: colTo }
        }
    };

    if (extra) {
        _.extend(obj, extra);
    }

    return obj;
}

Lexer.prototype = {
    setInput: function(code) {
        this.code = code.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
        this.line = 1;
        this.pos = 0;
        this.linePos = 0;
        this.done = this.code.length === 0;
        this.curToken = null;
        this.indent = "";
        this.whitespace = [];
        this.comments = [];
        this._annotate = null;
        this._annotated = false;
        this.annotations = {};
    },

    getSource: function() {
        return this.code || "";
    },

    getComments: function() {
        return this.comments;
    },

    getAnnotations: function() {
        return this.annotations;
    },

    addWhitespace: function(tok) {
        this.whitespace.push(tok);

        if (tok.type === "BlockComment") {
            this.comments.push(tok);
        } else if (tok.type === "LineComment") {
            this.comments.push(tok);
            var parts = /^\/\/\s*tag:([a-zA-Z]+)(.*)$/.exec(tok.value);

            if (parts) {
                var line = tok.loc.start.line;
                this._annotate = {
                    tag: parts[1],
                    value: (parts[2] || "").trim()
                };
                this._annotated = false;
            }
        }
    },

    getWhitespace: function() {
        return this.whitespace;
    },

    readNextToken: function() {
        var result = null,
            token = "",
            state = 0,
            eof = false,
            eat = false,
            continuation = false,
            nlInComment = false,
            ch = this.code.charAt(this.pos),
            ch1 = this.code.charAt(this.pos + 1),
            addCommentNewline = false,
            from,
            colFrom,
            tmpLine = 0,
            i;

        if (ch1 === "") {
            eof = true;
            this.pos += 1;
            ch1 = "\n";
        }

        if (ch !== "" && !this.done) {
            while (true) {
                switch (state) {
                    case 0:
                        from = this.pos;
                        colFrom = this.linePos;

                        // start state
                        if (/[_A-Za-z]/.test(ch)) {
                            if (!/[_A-Za-z0-9]/.test(ch1)) {
                                result = makeToken(
                                    "name",
                                    ch,
                                    this.line,
                                    from,
                                    this.pos,
                                    colFrom,
                                    this.linePos
                                );
                            } else {
                                state = VARIABLE;
                                token = ch;
                            }
                        } else if (ch === " " || ch === "\t") {
                            if (ch1 === " " || ch1 === "\t") {
                                token = ch;
                                state = WHITESPACE;
                            } else {
                                this.addWhitespace(
                                    makeToken(
                                        "(ws)",
                                        ch,
                                        this.line,
                                        from,
                                        this.pos,
                                        colFrom,
                                        this.linePos
                                    )
                                );
                            }
                        } else if (ch === ";") {
                            result = makeToken(
                                "(nl)",
                                ch,
                                this.line,
                                from,
                                this.pos,
                                colFrom,
                                this.linePos
                            );
                        } else if (ch === "\n") {
                            if (continuation) {
                                this.addWhitespace(
                                    makeToken(
                                        "(nl)",
                                        ch,
                                        this.line,
                                        from,
                                        this.pos,
                                        colFrom,
                                        this.linePos
                                    )
                                );

                                // skip newline.
                                continuation = false;
                                token = "";
                            } else {
                                result = makeToken(
                                    "(nl)",
                                    ch,
                                    this.line,
                                    from,
                                    this.pos,
                                    colFrom,
                                    this.linePos
                                );
                            }
                        } else if (ch === "\\") {
                            continuation = true;
                            this.addWhitespace(
                                makeToken(
                                    "continuation",
                                    ch,
                                    this.line,
                                    from,
                                    this.pos,
                                    colFrom,
                                    this.linePos
                                )
                            );
                        } else if (ch === "/" && ch1 === "/") {
                            state = LINE_COMMENT;
                            token = ch;
                        } else if (ch === "/" && ch1 === "*") {
                            eat = true;
                            state = BLOCK_COMMENT;
                            addCommentNewline = false;
                            nlInComment = false;
                            token = "/*";
                        } else if (ch === "'") {
                            state = SINGLE_STR;
                            token = "";
                        } else if (ch === '"') {
                            state = DOUBLE_STR;
                            token = "";
                        } else if (ch === "." && ch1 === ".") {
                            state = ELLIPSIS;
                            token = ".";
                        } else if (ch === "." && /[0-9]/.test(ch1)) {
                            state = NUMBER_DECIMAL;
                            token = ch;
                        } else if (/[0-9]/.test(ch) && ch1 === ".") {
                            state = NUMBER_NO_DECIMAL;
                            token = ch;
                        } else if (/[0-9]/.test(ch) && !/[0-9]/.test(ch1)) {
                            result = makeToken(
                                "number",
                                ch,
                                this.line,
                                from,
                                this.pos,
                                colFrom,
                                this.linePos
                            );
                        } else if (/[0-9]/.test(ch)) {
                            state = NUMBER_NO_DECIMAL;
                            token = ch;
                        } else if (ch === "#" && /[0-9]/.test(ch1)) {
                            state = OBJ_LITERAL;
                            token = "#";
                        } else if (ch === "$" && ch1 === "$") {
                            result = makeToken(
                                "operator",
                                "$$",
                                this.line,
                                from,
                                this.pos,
                                colFrom,
                                this.linePos
                            );
                            eat = true;
                        } else if (ch === "$") {
                            result = makeToken(
                                "operator",
                                "$",
                                this.line,
                                from,
                                this.pos,
                                colFrom,
                                this.linePos
                            );
                        } else if (
                            ("&^|+-*/%<>=!".indexOf(ch) !== -1 && ch1 === "=") ||
                            (ch === "<" && ch1 === ">") ||
                            (ch === "<" && ch1 === "<") ||
                            (ch === ">" && ch1 === ">") ||
                            (ch === "|" && ch1 === "|") ||
                            (ch === "&" && ch1 === "&") ||
                            (ch === "^" && ch1 === "^")
                        ) {
                            result = makeToken(
                                "operator",
                                ch + ch1,
                                this.line,
                                from,
                                this.pos,
                                colFrom,
                                this.linePos
                            );
                            eat = true;
                        } else if ("~#{}/%*,.()[]?:<>!=+-^|&".indexOf(ch) !== -1) {
                            result = makeToken(
                                "operator",
                                ch,
                                this.line,
                                from,
                                this.pos,
                                colFrom,
                                this.linePos
                            );
                        }

                        break;
                    case 1: // VARIABLE
                        i = this.pos;
                        while (/[_A-Za-z0-9]/.test(ch1)) {
                            this.pos += 1;
                            this.linePos += 1;
                            ch1 = this.code.charAt(this.pos + 1);
                        }

                        if (!ch1) {
                            eof = true;
                        }

                        token += this.code.substring(i, this.pos + 1);
                        result = makeToken(
                            "name",
                            token,
                            this.line,
                            from,
                            this.pos,
                            colFrom,
                            this.linePos
                        );

                        break;
                    case 2: // LINE_COMMENT
                        i = this.pos;
                        while (ch1 && ch1 !== "\n") {
                            this.pos++;
                            this.linePos++;
                            ch1 = this.code.charAt(this.pos + 1);
                        }

                        token += this.code.substring(i, this.pos + 1);

                        if (!ch1) {
                            eof = true;
                        }

                        if (!continuation) {
                            this.addWhitespace(
                                makeToken(
                                    "LineComment",
                                    token,
                                    this.line,
                                    from,
                                    this.pos,
                                    colFrom,
                                    this.linePos
                                )
                            );
                            result = makeToken(
                                "(nl)",
                                "\n",
                                this.line,
                                this.pos,
                                this.pos,
                                this.linePos,
                                this.linePos
                            );
                        } else {
                            this.addWhitespace(
                                makeToken(
                                    "LineComment",
                                    token,
                                    this.line,
                                    from,
                                    this.pos,
                                    colFrom,
                                    this.linePos
                                )
                            );
                            this.addWhitespace(
                                makeToken(
                                    "(nl)",
                                    "\n",
                                    this.line,
                                    this.pos,
                                    this.pos,
                                    this.linePos,
                                    this.linePos
                                )
                            );
                        }

                        // ignore comments.
                        eat = true;
                        state = 0;
                        token = "";

                        break;
                    case 3: // BLOCK COMMENT
                        if (ch === "*" && ch1 === "/") {
                            this.addWhitespace(
                                makeToken(
                                    "BlockComment",
                                    token + "*/",
                                    this.line,
                                    from,
                                    this.pos,
                                    colFrom,
                                    this.linePos
                                )
                            );

                            // ignore comments.
                            state = 0;
                            token = "";

                            // We want block comments to add one newline token if it contains a newline.
                            // However, if it only contains one newline and it was preceded by a continuation token,
                            // don't add the newline.
                            if ((continuation === false && nlInComment) || addCommentNewline) {
                                result = makeToken(
                                    "(nl)",
                                    "",
                                    tmpLine || this.line,
                                    from,
                                    from,
                                    colFrom,
                                    colFrom
                                );
                            }

                            eat = true;
                        } else {
                            if (ch === "\n") {
                                if (nlInComment === false) {
                                    tmpLine = this.line;
                                    from = this.pos;
                                    colFrom = this.linePos;
                                }

                                // If this is >= second newline, and we're preceded by a continuation, add a newline.
                                addCommentNewline = continuation && nlInComment;
                                nlInComment = true;
                            }
                            token += ch;
                        }
                        break;
                    case 4: // SINGLE_STR
                        if (ch === "'" && ch1 === "'") {
                            token += "'";
                            eat = true;
                        } else if (ch === "'") {
                            result = makeToken(
                                "string",
                                token,
                                this.line,
                                from,
                                this.pos,
                                colFrom,
                                this.linePos,
                                { single: true }
                            );
                        } else {
                            token += ch;
                        }
                        break;
                    case 5: // DOUBLE_STR -- first ch will not be '"'
                        if (ch === '"' && ch1 === '"') {
                            token += '"';
                            eat = true;
                        } else if (ch === '"') {
                            result = makeToken(
                                "string",
                                token,
                                this.line,
                                from,
                                this.pos,
                                colFrom,
                                this.linePos,
                                { double: true }
                            );
                        } else {
                            token += ch;
                        }
                        break;
                    case 6: // NUMBER_NO_DECIMAL
                        if (ch === ".") {
                            if (/[0-9]/.test(ch1)) {
                                token += ".";
                                state = NUMBER_DECIMAL;
                            } else {
                                result = makeToken(
                                    "number",
                                    token,
                                    this.line,
                                    from,
                                    this.pos,
                                    colFrom,
                                    this.linePos
                                );
                            }
                        } else if (!/[.0-9]/.test(ch1)) {
                            result = makeToken(
                                "number",
                                token + ch,
                                this.line,
                                from,
                                this.pos,
                                colFrom,
                                this.linePos
                            );
                        } else {
                            token += ch;
                        }
                        break;
                    case 7: // NUMBER_DECIMAL
                        if (!/[0-9]/.test(ch1)) {
                            result = makeToken(
                                "number",
                                token + ch,
                                this.line,
                                from,
                                this.pos,
                                colFrom,
                                this.linePos
                            );
                        } else {
                            token += ch;
                        }
                        break;
                    case 8: // ELLIPSIS
                        token += ch;

                        if (ch1 !== ".") {
                            if (token !== "...") {
                                token = "...";
                            }
                            result = makeToken(
                                "operator",
                                token,
                                this.line,
                                from,
                                this.pos,
                                colFrom,
                                this.linePos
                            );
                        }
                        break;
                    case 9: // OBJ_LITERAL  -- #F1A981C3
                        token += ch;

                        if (!/[0-9a-fA-F]/.test(ch1)) {
                            result = makeToken(
                                "objref",
                                token,
                                this.line,
                                from,
                                this.pos,
                                colFrom,
                                this.linePos
                            );
                        }
                        break;
                    case 10: // WHITESPACE
                        token += ch;

                        if (!/[ \t]/.test(ch1)) {
                            this.addWhitespace(
                                makeToken(
                                    "(ws)",
                                    token,
                                    this.line,
                                    from,
                                    this.pos,
                                    colFrom,
                                    this.linePos
                                )
                            );
                            state = 0;
                        }
                        break;
                }

                if (eof) {
                    this.pos++;
                    break;
                }

                this.linePos++;

                // keep track of lines.
                if (ch === "\n") {
                    this.line++;
                    this.linePos = 0;
                }

                if (eat) {
                    this.linePos += 1;

                    // consume the whole lookahead and keep track of lines.
                    if (ch1 === "\n") {
                        this.line++;
                        this.linePos = 0;
                    }

                    this.pos += 2;
                    ch = this.code.charAt(this.pos);
                } else {
                    this.pos++;
                    ch = ch1;
                }

                if (result) {
                    // if we have a result now, just exit.
                    break;
                }

                // update lookahead.
                ch1 = this.code.charAt(this.pos + 1);

                // check for eof conditions.
                if (ch === "") {
                    // we must have consumed the lookahead and ran into the eof.
                    break;
                } else if (ch1 === "") {
                    // lookahead is eof -- process one more character (set lookahead to newline).
                    eof = true;
                    ch1 = "\n";
                }
                eat = false;
            }
        }

        if (!this.done && result === null) {
            this.done = true;
        }

        if (result) {
            if (result.type === "(nl)") {
                if (this._annotate && this._annotated) {
                    this._annotate = null;
                }
            } else if (this._annotate !== null) {
                result.annotation = this._annotate;
                this._annotated = true;
            }
        }

        return result;
    },

    get: function() {
        var rtn = null;
        if (this.curToken) {
            rtn = this.curToken;
            this.curToken = null;
        } else {
            rtn = this.readNextToken();
        }
        return rtn;
    },

    peek: function() {
        if (!this.curToken) {
            this.curToken = this.readNextToken();
        }
        return this.curToken;
    }
};
