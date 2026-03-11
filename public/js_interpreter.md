Building a JavaScript interpreter
=================================

![best programming language](https://miro.medium.com/v2/resize:fit:1400/format:webp/1*x15WU1tjr_qt2cEJaOgPSw.png)

[Reference](https://medium.com/@easonh887/building-a-javascript-interpreter-ac208f754185)

by [Eason Huang](https://medium.com/@easonh887?source=post_page---byline--ac208f754185---------------------------------------)





Ever wonder what goes on when you run code? How `node file.js` takes in all of your code and somehow manages to convert it into instructions for your CPU? The reality is that there is a lot that goes under the hood to interpret your code.

I built an interpreter for Javascript, inspired by [this C interpreter project](https://github.com/lotabout/write-a-C-interpreter). In this article, I’ll be going over how this interpreter takes your code, validates the syntax, and executes it.

You can try it out here: [https://guyonwifi.github.io/js-interpreter/](https://guyonwifi.github.io/js-interpreter/)

All the source code can be found in this repository: [https://github.com/GuyOnWifi/js-interpreter](https://github.com/GuyOnWifi/js-interpreter)

How I Built It
--------------

The interpreter is split up into 3 main parts: the lexer, the parser and the executor. These divide up the many tasks (scanning for keywords, identifiers, syntax validation, order of operations, etc) of the interpreter.

![Source: Ruslan’s Blog](https://miro.medium.com/v2/resize:fit:1400/format:webp/1*FriK7YiJR4I741MvkrOPeQ.png)

### Lexer

The lexer is responsible for converting the source code into a token stream. This handles the bulk of the whitespace handling, string/number differentiation, and keyword recognition. It simplifies the task for the parser by reducing down the code into its most important aspects, which is represented as a token stream.

```js
class Lexer {
  constructor(code) {
    this.code = code;
    this.pos = 0;
    this.line = 0;
  }
  next() {
    const CHAR_RE = /[a-zA-Z]/;
    const VAR_RE = /[a-zA-Z0-9_]/;
    const NUM_RE = /[0-9]/;
    const OP_RE = /^(!|\+|-|\*|\/|==|!=|&&|\|\||<|>|<=|>=|=|!=)$/;
    const KEYWORD_RE = /^(let|const|if|else|while|function|return|print)$/;
    let token = {
        type: "",
        value: "",
        line: 0,
    }
    ...
    while (this.pos < this.code.length) {...}
    ...
    return token;
  }
}
```

The bulk of the work is handled by these regular expressions, which divide up text into characters, variable identifiers, numbers, operators or keywords

```js
const CHAR_RE = /[a-zA-Z]/;
const VAR_RE = /[a-zA-Z0-9_]/;
const NUM_RE = /[0-9]/;
const OP_RE = /^(!|\+|-|\*|\/|==|!=|&&|\|\||<|>|<=|>=|=|!=)$/;
const KEYWORD_RE = /^(let|const|if|else|while|function|return|print)$/;
```

The next() function gets the next token that matches one of the regular expressions, returning tokens in the form

```json
{
  "type": "keyword|string|number|identifier|operator|semicolon|parentheses|codeblock|comma",
  "value": "",
  "line": #
}
```

### Parser

The parser then takes this token stream and validates the grammar rules. If it follows all the syntax correctly, it spits out an Abstract Syntax Tree (AST). The AST an intermediate representation of the code that structures it in a way that is manageable by our executor. Our goal is to make sure the parser will only ever need to peek at the next 1 token. This is known as a LL(1) parser.

The syntax can be described using Extended Backus–Naur form (EBNF), a notation commonly used to describe the grammar/syntax of programming languages. The advantage of using EBNF is that once it is written out, it is extremely easy to write recursion functions to implement it. This is known as **recursive-descent parsing.**

```ebnf
code_block ::= {line}
line ::= func_decl | var_decl | statement 
func_decl ::= "function" [id] "(" param_decl ")" "{" code_block "}"
param_decl ::= [id] {"," [id]}
var_decl ::= ("let" | "const") id ["=" (string | int | id)]
statement ::= if_chain_sm | while_sm | return_sm | expr
if_chain_sm ::= if_sm {"else" if_sm} [else_sm]
if_sm ::= "if" "(" expr ")" "{" code_block "}"
else_sm ::= "else" "{" {line} "}"
while_sm ::= "while" "(" expr ")" "{" code_block "}"
expr ::= id "=" logical_or
logical_or ::= logical_and ["||" logical_or]
logical_and ::= equality_expr ["&&" logical_and]
equality_expr ::= comparison_expr [("==" | "!=") equality_expr]
comparison_expr ::= term [("<" | "<=" | ">=" | ">") comparison_expr]
term ::= factor ["+" | "-" term]
factor ::= unary ["*" | "/" factor]
unary ::= ("!" | "+" | "-") group
group ::= number | string | id | func_call | "(" expr ")"
func_call ::= id "(" [expr] {"," [expr]} ")"
(*an identifier*)
id ::= /[a-zA-Z][a-zA-Z0-9_]/
```

One of the trickiest parts of the parser is determining the order of operations. For example, the expression `5 + 3 * -2` should be executed as `5 + (3 * (-2))` , since the multiplication takes precedence. Unary operators like the negative symbol (-) should also be taken account for. What makes EBNF so powerful is it’s ability to describe this.

```ebnf
expr ::= id "=" logical_or
logical_or ::= logical_and ["||" logical_or]
logical_and ::= equality_expr ["&&" logical_and]
equality_expr ::= comparison_expr [("==" | "!=") equality_expr]
comparison_expr ::= term [("<" | "<=" | ">=" | ">") comparison_expr]
term ::= factor ["+" | "-" term]
factor ::= unary ["*" | "/" factor]
unary ::= ("!" | "+" | "-") group
group ::= number | string | id | func_call | "(" expr ")"
func_call ::= id "(" [expr] {"," [expr]} ")"
```

Think of each element in the EBNF as a function. It will be recursively called, handling the highest precedence operator first, which is why it is deeply nested in the recursion tree.

Take a look at the implementation of the EBNF below. Although it seems really complex and long, most of the code is repetitive and relies on two principles: recursive functions and token lookahead to determine the operators. For most of the functions, we get the current expression, then lookahead to see if the next token is an operator. If there is, then we parse the right side of the expression. Because of the recursive decision tree, operators will be handled with the correct precedence.

```js
group() {
    let tk = this.tokens[this.pos];
    if (tk.type === "number" || tk.type === "string") {
        this.pos++;
        return tk.value;
    } else if (tk.type === "identifier") {
        this.pos++;
        // if there are brackets its a function call
        if (this.tokens[this.pos].type === "parentheses" && this.tokens[this.pos].value === "(") {
            let node = {
                type: "CallExpression",
                arguments: [],
                callee: tk.value
            }
            this.match("parentheses", "(");
            node.arguments = this.funcArg();
            this.match("parentheses", ")");
            return node;
        }
        return {
            type: "Identifier",
            name: tk.value
        }
    } else if (tk.type === "parentheses" && tk.value === "(") {
        this.match("parentheses", "(");
        let val = this.expr();
        this.match("parentheses", ")");
        return val;
    } else {
        return;
    }
}
unary() {
    let tk = this.tokens[this.pos];
    if (tk.type === "operator" && tk.value.match(/^(\+|-|!)$/)) {
        this.match("operator");
        return {
            type: "UnaryExpression",
            operator: tk.value,
            argument: this.group()
        }
    } else {
        return this.group();
    }
}
factor() {
    let left = this.unary();
    let tk = this.tokens[this.pos];
    if (tk.type === "operator" && tk.value.match(/^(\*|\/)$/)) {
        this.match("operator");
        let right = this.factor();
        return {
            type: "BinaryExpression",
            operator: tk.value,
            left: left,
            right: right
        }
    } else {
        return left;
    }
}
term() {
    let left = this.factor();
    let tk = this.tokens[this.pos];
    if (tk.type === "operator" && tk.value.match(/^(\+|-)$/)) {
        this.match("operator");
        let right = this.term();
        return {
            type: "BinaryExpression",
            operator: tk.value,
            left: left,
            right: right
        }
    } else {
        return left;
    }
}
comparisonExpr() {
    let left = this.term();
    let tk = this.tokens[this.pos];
    if (tk.type === "operator" && tk.value.match(/^(<|>|<=|>=)$/)) {
        this.match("operator");
        let right = this.comparisonExpr();
        return {
            type: "ComparisonExpression",
            operator: tk.value,
            left: left,
            right: right
        }
    } else {
        return left;
    }
}
equalityExpr() {
    let left = this.comparisonExpr();
    let tk = this.tokens[this.pos];
    if (tk.type === "operator" && tk.value.match(/^(==|!=)$/)) {
        this.match("operator");
        let right = this.equalityExpr();
        return {
            type: "ComparisonExpression",
            operator: tk.value,
            left: left,
            right: right
        }
    } else {
        return left;
    }
}
logicalAnd() {
    let left = this.equalityExpr();
    let tk = this.tokens[this.pos];
    if (tk.type === "operator" && tk.value === "&&") {
        this.match("operator", "&&");
        let right = this.logicalAnd();
        return {
            type: "LogicalExpression",
            operator: "&&",
            left: left,
            right: right
        }
    } else {
        return left;
    }
}
logicalOr() {
    let left = this.logicalAnd();
    
    let tk = this.tokens[this.pos];
    if (tk.type === "operator" && tk.value === "||") {
        this.match("operator", "||");
        let right = this.logicalOr();
        return {
            type: "LogicalExpression",
            operator: "||",
            left: left,
            right: right
        }
    } else {
        return left;
    }
}
expr() {
    let tk = this.tokens[this.pos];
    let next = this.tokens[this.pos + 1];
    if (tk.type === "identifier" && next.type === "operator" && next.value === "=") {
        tk = this.match("identifier");
        this.match("operator", "=")
        return {
            type: "AssignmentExpression",
            left: tk.value,
            right: this.logicalOr(),
            operator: "="
        }
    } else {
        return this.logicalOr();
    }
}
```

Although it seems like a daunting task, with the right description of the syntax, implementation is very simple. It only took ~430 lines of code for the parser, most of which was fairly straightforward and repetitive.

### Executor

The last step of the interpreter is the execution. It takes the AST generated by our parser and executes the code. Once again, this uses a lot of function recursion to traverse through the tree. Luckily, it is smooth sailing from here because the bulk of the work (operator precedence, syntax verification, etc) has been done by the parser.

```js
class Executor {
  constructor(ast) {
      this.ast = ast;
      this.variables = [];
      this.functions = [];
  }
  searchIdentifiers(id) {...}
  execNode(node, inFunctionCall) {...}
}
```

`execNode()` is the main function that does the work, and will recursively explore the tree, executing the nodes.

There is an important thing to note here: the variable and function stacks (represented as an array). Every time we encounter a variable definition, we add it to the `this.variables` stack. Every time a variable is called, we search through our variable stack.

Function definitions are stored in the `this.functions` stack, and whenever a function is called, we search through the functions stack and execute the code. However, we also need to handle function arguments and push those to the stack. We keep track of where the variable stack should be _after_ the function call is over, to release any local variables out of memory.

### Main File

The interpreter.js is the main file that takes in the code from a file. and interprets the script by passing it through the lexer, parser and executor.

Once again, you can try it here: [https://guyonwifi.github.io/js-interpreter/](https://guyonwifi.github.io/js-interpreter/) (check out the AST and token stream tab!)

Make sure to check out all of the source code here: [https://github.com/GuyOnWifi/js-interpreter](https://github.com/GuyOnWifi/js-interpreter)! Leave a star if you like it!

Resources
---------

These were some awesome reasons that helped with this project, high recommend checking out if you’re interested in compiler theory!

*   [https://github.com/lotabout/write-a-C-interpreter](https://github.com/lotabout/write-a-C-interpreter)
*   [https://craftinginterpreters.com/](https://craftinginterpreters.com/)
*   [https://www.2am.tech/blog/building-a-language-interpreter-in-javascript](https://www.2am.tech/blog/building-a-language-interpreter-in-javascript)
*   [https://daily.dev/blog/javascript-interpreter-basics-for-developers](https://daily.dev/blog/javascript-interpreter-basics-for-developers)