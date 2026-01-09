//! Tree-sitter based TypeScript transpiler.

use rhizome_lotus_ir::SExpr;
use thiserror::Error;
use tree_sitter::{Node, Parser, Tree};

#[derive(Debug, Error)]
pub enum TranspileError {
    #[error("parse error: {0}")]
    Parse(String),

    #[error("unsupported syntax: {0}")]
    Unsupported(String),

    #[error("expected {expected}, got {got}")]
    UnexpectedNode { expected: String, got: String },
}

/// Transpile TypeScript source to S-expressions.
pub fn transpile(source: &str) -> Result<SExpr, TranspileError> {
    let mut parser = Parser::new();
    let language = tree_sitter_typescript::LANGUAGE_TYPESCRIPT;
    parser
        .set_language(&language.into())
        .map_err(|err| TranspileError::Parse(err.to_string()))?;

    let tree = parser
        .parse(source, None)
        .ok_or_else(|| TranspileError::Parse("failed to parse".into()))?;

    let ctx = TranspileContext::new(source);
    ctx.transpile_program(&tree)
}

struct TranspileContext<'a> {
    source: &'a str,
}

impl<'a> TranspileContext<'a> {
    fn new(source: &'a str) -> Self {
        Self { source }
    }

    fn node_text(&self, node: Node) -> &str {
        node.utf8_text(self.source.as_bytes()).unwrap_or("")
    }

    fn transpile_program(&self, tree: &Tree) -> Result<SExpr, TranspileError> {
        let root = tree.root_node();

        if root.has_error() {
            return Err(TranspileError::Parse("syntax error in source".into()));
        }

        let mut statements = Vec::new();
        let mut cursor = root.walk();

        for child in root.children(&mut cursor) {
            if child.is_named() {
                statements.push(self.transpile_node(child)?);
            }
        }

        // If single statement, return it directly
        if statements.len() == 1 {
            Ok(statements.remove(0))
        } else {
            // Wrap multiple statements in std.seq
            Ok(SExpr::call("std.seq", statements))
        }
    }

    fn transpile_node(&self, node: Node) -> Result<SExpr, TranspileError> {
        match node.kind() {
            // Literals
            "number" => self.transpile_number(node),
            "string" => self.transpile_string(node),
            "true" => Ok(SExpr::bool(true).erase_type()),
            "false" => Ok(SExpr::bool(false).erase_type()),
            "null" => Ok(SExpr::null().erase_type()),
            "undefined" => Ok(SExpr::null().erase_type()),

            // Expressions
            "identifier" => Ok(SExpr::call(
                "std.var",
                vec![SExpr::string(self.node_text(node)).erase_type()],
            )),
            "this" => Ok(SExpr::call("std.this", vec![])),
            "binary_expression" => self.transpile_binary_expr(node),
            "unary_expression" => self.transpile_unary_expr(node),
            "parenthesized_expression" => self.transpile_parenthesized(node),
            "assignment_expression" => self.transpile_assignment_expr(node),
            "augmented_assignment_expression" => self.transpile_augmented_assignment_expr(node),
            "call_expression" => self.transpile_call_expr(node),
            "member_expression" => self.transpile_member_expr(node),
            "subscript_expression" => self.transpile_subscript_expr(node),
            "array" => self.transpile_array(node),
            "object" => self.transpile_object(node),
            "template_string" => self.transpile_template_string(node),
            "arrow_function" => self.transpile_arrow_function(node),
            "ternary_expression" => self.transpile_ternary(node),

            // Type assertions - just pass through the inner expression
            "as_expression" => self.transpile_as_expression(node),
            "non_null_expression" => self.transpile_non_null_expression(node),

            // Statements
            "expression_statement" => self.transpile_expression_statement(node),
            "lexical_declaration" => self.transpile_lexical_declaration(node),
            "variable_declaration" => self.transpile_variable_declaration(node),
            "if_statement" => self.transpile_if_statement(node),
            "while_statement" => self.transpile_while_statement(node),
            "for_statement" => self.transpile_for_statement(node),
            "for_in_statement" => self.transpile_for_in_statement(node),
            "switch_statement" => self.transpile_switch_statement(node),
            "break_statement" => Ok(SExpr::call("std.break", vec![])),
            "continue_statement" => Ok(SExpr::call("std.continue", vec![])),
            "return_statement" => self.transpile_return_statement(node),
            "statement_block" => self.transpile_block(node),

            // Comments and empty statements (skip)
            "comment" => Ok(SExpr::null().erase_type()),
            "empty_statement" => Ok(SExpr::null().erase_type()),

            // else_clause: extract the body
            "else_clause" => self.transpile_else_clause(node),

            kind => Err(TranspileError::Unsupported(format!(
                "node type '{}': {}",
                kind,
                self.node_text(node)
            ))),
        }
    }

    fn transpile_number(&self, node: Node) -> Result<SExpr, TranspileError> {
        let text = self.node_text(node);
        // Strip numeric separators (e.g., 10_000 -> 10000)
        let clean_text = text.replace('_', "");
        let value: f64 = clean_text
            .parse()
            .map_err(|_| TranspileError::Parse(format!("invalid number: {}", text)))?;
        Ok(SExpr::number(value).erase_type())
    }

    fn transpile_string(&self, node: Node) -> Result<SExpr, TranspileError> {
        let text = self.node_text(node);
        // Remove quotes and handle escapes
        let inner = if text.starts_with('"') || text.starts_with('\'') {
            &text[1..text.len() - 1]
        } else if text.starts_with('`') {
            // Template literal - basic support
            &text[1..text.len() - 1]
        } else {
            text
        };
        // TODO: proper escape handling
        let unescaped = inner
            .replace("\\n", "\n")
            .replace("\\t", "\t")
            .replace("\\r", "\r")
            .replace("\\\"", "\"")
            .replace("\\'", "'")
            .replace("\\\\", "\\");
        Ok(SExpr::string(unescaped).erase_type())
    }

    /// Handle template strings with interpolation (e.g., `Hello ${name}!`)
    /// Transpiles to str.concat calls
    fn transpile_template_string(&self, node: Node) -> Result<SExpr, TranspileError> {
        let mut parts: Vec<SExpr> = Vec::new();
        let mut cursor = node.walk();

        for child in node.children(&mut cursor) {
            match child.kind() {
                // String fragment between interpolations
                "string_fragment" | "template_fragment" => {
                    let text = self.node_text(child);
                    if !text.is_empty() {
                        parts.push(SExpr::string(text).erase_type());
                    }
                }
                // Interpolation: ${...}
                "template_substitution" => {
                    // Find the expression inside the ${ }
                    if let Some(expr) = child.named_child(0) {
                        parts.push(self.transpile_node(expr)?);
                    }
                }
                // Skip the ` characters
                "`" => {}
                _ => {}
            }
        }

        // If no parts, return empty string
        if parts.is_empty() {
            return Ok(SExpr::string("").erase_type());
        }

        // If single part, return it directly (wrap in std.string for type coercion)
        if parts.len() == 1 {
            return Ok(SExpr::call("std.string", parts));
        }

        // Multiple parts: use str.concat
        Ok(SExpr::call("str.concat", parts))
    }

    /// Handle TypeScript `as` type assertions (e.g., `foo as Bar`)
    /// Just pass through the expression, ignoring the type annotation
    fn transpile_as_expression(&self, node: Node) -> Result<SExpr, TranspileError> {
        // as_expression has two children: the expression and the type
        // We just want the expression (first child)
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            if child.is_named()
                && child.kind() != "type_identifier"
                && !child.kind().contains("type")
            {
                return self.transpile_node(child);
            }
        }
        // Fallback: try first named child
        let expr = node
            .named_child(0)
            .ok_or_else(|| TranspileError::Parse("as_expression missing expression".into()))?;
        self.transpile_node(expr)
    }

    /// Handle TypeScript non-null assertions (e.g., `foo!`)
    /// Just pass through the expression
    fn transpile_non_null_expression(&self, node: Node) -> Result<SExpr, TranspileError> {
        let expr = node.named_child(0).ok_or_else(|| {
            TranspileError::Parse("non_null_expression missing expression".into())
        })?;
        self.transpile_node(expr)
    }

    fn transpile_binary_expr(&self, node: Node) -> Result<SExpr, TranspileError> {
        let left = node
            .child_by_field_name("left")
            .ok_or_else(|| TranspileError::Parse("binary_expression missing left".into()))?;
        let right = node
            .child_by_field_name("right")
            .ok_or_else(|| TranspileError::Parse("binary_expression missing right".into()))?;
        let operator = node
            .child_by_field_name("operator")
            .ok_or_else(|| TranspileError::Parse("binary_expression missing operator".into()))?;

        let left_expr = self.transpile_node(left)?;
        let right_expr = self.transpile_node(right)?;
        let op_text = self.node_text(operator);

        let opcode = match op_text {
            // Arithmetic
            "+" => "math.add",
            "-" => "math.sub",
            "*" => "math.mul",
            "/" => "math.div",
            "%" => "math.mod",
            "**" => "math.pow",

            // Comparison
            "==" | "===" => "bool.eq",
            "!=" | "!==" => "bool.neq",
            "<" => "bool.lt",
            ">" => "bool.gt",
            "<=" => "bool.lte",
            ">=" => "bool.gte",

            // Logical
            "&&" => "bool.and",
            "||" => "bool.or",
            "??" => "bool.nullish",

            // String
            // + is handled above, but for explicit string concat we could check types
            _ => {
                return Err(TranspileError::Unsupported(format!(
                    "operator '{}'",
                    op_text
                )));
            }
        };

        Ok(SExpr::call(opcode, vec![left_expr, right_expr]))
    }

    fn transpile_unary_expr(&self, node: Node) -> Result<SExpr, TranspileError> {
        let operator = node
            .child_by_field_name("operator")
            .ok_or_else(|| TranspileError::Parse("unary_expression missing operator".into()))?;
        let argument = node
            .child_by_field_name("argument")
            .ok_or_else(|| TranspileError::Parse("unary_expression missing argument".into()))?;

        let arg_expr = self.transpile_node(argument)?;
        let op_text = self.node_text(operator);

        let opcode = match op_text {
            "!" => "bool.not",
            "-" => "math.neg",
            "+" => return Ok(arg_expr), // Unary + is a no-op
            _ => {
                return Err(TranspileError::Unsupported(format!(
                    "unary operator '{}'",
                    op_text
                )));
            }
        };

        Ok(SExpr::call(opcode, vec![arg_expr]))
    }

    fn transpile_parenthesized(&self, node: Node) -> Result<SExpr, TranspileError> {
        // Find the inner expression
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            if child.is_named() {
                return self.transpile_node(child);
            }
        }
        Err(TranspileError::Parse(
            "empty parenthesized expression".into(),
        ))
    }

    fn transpile_assignment_expr(&self, node: Node) -> Result<SExpr, TranspileError> {
        let left = node
            .child_by_field_name("left")
            .ok_or_else(|| TranspileError::Parse("assignment missing left".into()))?;
        let right = node
            .child_by_field_name("right")
            .ok_or_else(|| TranspileError::Parse("assignment missing right".into()))?;

        let right_expr = self.transpile_node(right)?;

        match left.kind() {
            "identifier" => {
                // Simple variable assignment: x = value
                let var_name = self.node_text(left);
                Ok(SExpr::call(
                    "std.set",
                    vec![SExpr::string(var_name).erase_type(), right_expr],
                ))
            }
            "member_expression" => {
                // Property assignment: obj.prop = value
                let obj = left
                    .child_by_field_name("object")
                    .ok_or_else(|| TranspileError::Parse("member missing object".into()))?;
                let prop = left
                    .child_by_field_name("property")
                    .ok_or_else(|| TranspileError::Parse("member missing property".into()))?;
                let obj_expr = self.transpile_node(obj)?;
                let prop_name = self.node_text(prop);
                Ok(SExpr::call(
                    "obj.set",
                    vec![obj_expr, SExpr::string(prop_name).erase_type(), right_expr],
                ))
            }
            "subscript_expression" => {
                // Index assignment: arr[i] = value
                let obj = left
                    .child_by_field_name("object")
                    .ok_or_else(|| TranspileError::Parse("subscript missing object".into()))?;
                let index = left
                    .child_by_field_name("index")
                    .ok_or_else(|| TranspileError::Parse("subscript missing index".into()))?;
                let obj_expr = self.transpile_node(obj)?;
                let idx_expr = self.transpile_node(index)?;
                Ok(SExpr::call(
                    "list.set",
                    vec![obj_expr, idx_expr, right_expr],
                ))
            }
            _ => Err(TranspileError::Unsupported(format!(
                "assignment to '{}'",
                left.kind()
            ))),
        }
    }

    fn transpile_augmented_assignment_expr(&self, node: Node) -> Result<SExpr, TranspileError> {
        // Handle +=, -=, *=, /=, etc.
        let left = node
            .child_by_field_name("left")
            .ok_or_else(|| TranspileError::Parse("augmented assignment missing left".into()))?;
        let right = node
            .child_by_field_name("right")
            .ok_or_else(|| TranspileError::Parse("augmented assignment missing right".into()))?;
        let operator = node
            .child_by_field_name("operator")
            .ok_or_else(|| TranspileError::Parse("augmented assignment missing operator".into()))?;

        let left_expr = self.transpile_node(left)?;
        let right_expr = self.transpile_node(right)?;
        let op_text = self.node_text(operator);

        // Get the operation (strip the '=' suffix)
        let opcode = match op_text {
            "+=" => "math.add",
            "-=" => "math.sub",
            "*=" => "math.mul",
            "/=" => "math.div",
            "%=" => "math.mod",
            "**=" => "math.pow",
            "&&=" => "bool.and",
            "||=" => "bool.or",
            "??=" => "bool.nullish",
            _ => {
                return Err(TranspileError::Unsupported(format!(
                    "augmented assignment operator '{}'",
                    op_text
                )));
            }
        };

        // Build: left = opcode(left, right)
        let operation = SExpr::call(opcode, vec![left_expr, right_expr]);

        // Create the assignment
        match left.kind() {
            "identifier" => {
                let var_name = self.node_text(left);
                Ok(SExpr::call(
                    "std.set",
                    vec![SExpr::string(var_name).erase_type(), operation],
                ))
            }
            "member_expression" => {
                let obj = left
                    .child_by_field_name("object")
                    .ok_or_else(|| TranspileError::Parse("member missing object".into()))?;
                let prop = left
                    .child_by_field_name("property")
                    .ok_or_else(|| TranspileError::Parse("member missing property".into()))?;
                let obj_expr = self.transpile_node(obj)?;
                let prop_name = self.node_text(prop);
                Ok(SExpr::call(
                    "obj.set",
                    vec![obj_expr, SExpr::string(prop_name).erase_type(), operation],
                ))
            }
            "subscript_expression" => {
                let obj = left
                    .child_by_field_name("object")
                    .ok_or_else(|| TranspileError::Parse("subscript missing object".into()))?;
                let index = left
                    .child_by_field_name("index")
                    .ok_or_else(|| TranspileError::Parse("subscript missing index".into()))?;
                let obj_expr = self.transpile_node(obj)?;
                let idx_expr = self.transpile_node(index)?;
                Ok(SExpr::call("list.set", vec![obj_expr, idx_expr, operation]))
            }
            _ => Err(TranspileError::Unsupported(format!(
                "augmented assignment to '{}'",
                left.kind()
            ))),
        }
    }

    fn transpile_call_expr(&self, node: Node) -> Result<SExpr, TranspileError> {
        let function = node
            .child_by_field_name("function")
            .ok_or_else(|| TranspileError::Parse("call_expression missing function".into()))?;
        let arguments = node
            .child_by_field_name("arguments")
            .ok_or_else(|| TranspileError::Parse("call_expression missing arguments".into()))?;

        // Parse arguments
        let mut args = Vec::new();
        let mut cursor = arguments.walk();
        for child in arguments.children(&mut cursor) {
            if child.is_named() {
                args.push(self.transpile_node(child)?);
            }
        }

        // Check for method calls on objects (arr.push, str.split, etc.)
        if function.kind() == "member_expression" {
            if let Some(method_call) = self.try_transpile_method_call(function, args.clone())? {
                return Ok(method_call);
            }
        }

        // Try to get a simple function name (for opcodes like math.floor, list.push)
        if let Ok(func_name) = self.get_call_name(function) {
            Ok(SExpr::call(func_name, args))
        } else {
            // Complex expression - use std.apply
            let func_expr = self.transpile_node(function)?;
            let mut apply_args = vec![func_expr];
            apply_args.extend(args);
            Ok(SExpr::call("std.apply", apply_args))
        }
    }

    /// Try to transpile a method call on an object/array (e.g., arr.push(x), str.split(','))
    fn try_transpile_method_call(
        &self,
        member_expr: Node,
        args: Vec<SExpr>,
    ) -> Result<Option<SExpr>, TranspileError> {
        let object = member_expr
            .child_by_field_name("object")
            .ok_or_else(|| TranspileError::Parse("member_expression missing object".into()))?;
        let property = member_expr
            .child_by_field_name("property")
            .ok_or_else(|| TranspileError::Parse("member_expression missing property".into()))?;

        // If the object is a known namespace (str, list, obj, std, math, bool, etc.),
        // don't treat it as a method call - let it fall through to static opcode handling
        if object.kind() == "identifier" {
            let obj_name = self.node_text(object);
            if matches!(
                obj_name,
                "std"
                    | "math"
                    | "str"
                    | "list"
                    | "obj"
                    | "bool"
                    | "time"
                    | "json"
                    | "game"
                    | "kernel"
            ) {
                return Ok(None);
            }
        }

        let method_name = self.node_text(property);

        // Map known array/list methods to list.* opcodes
        let list_opcode = match method_name {
            "push" => Some("list.push"),
            "pop" => Some("list.pop"),
            "shift" => Some("list.shift"),
            "unshift" => Some("list.unshift"),
            "map" => Some("list.map"),
            "filter" => Some("list.filter"),
            "reduce" => Some("list.reduce"),
            "find" => Some("list.find"),
            "concat" => Some("list.concat"),
            "slice" => Some("list.slice"),
            "splice" => Some("list.splice"),
            "includes" => Some("list.includes"),
            "indexOf" => Some("list.indexOf"),
            "reverse" => Some("list.reverse"),
            "sort" => Some("list.sort"),
            "join" => Some("list.join"),
            "flatMap" => Some("list.flatMap"),
            _ => None,
        };

        // Map known string methods to str.* opcodes
        let str_opcode = match method_name {
            "split" => Some("str.split"),
            "trim" => Some("str.trim"),
            "toLowerCase" => Some("str.lower"),
            "toUpperCase" => Some("str.upper"),
            "substring" | "substr" => Some("str.slice"),
            "startsWith" => Some("str.startsWith"),
            "endsWith" => Some("str.endsWith"),
            "repeat" => Some("str.repeat"),
            "replace" => Some("str.replace"),
            _ => None,
        };

        // Try list opcodes first
        if let Some(opcode) = list_opcode {
            let obj_expr = self.transpile_node(object)?;
            let mut call_args = vec![obj_expr];
            call_args.extend(args);
            return Ok(Some(SExpr::call(opcode, call_args)));
        }

        // Try string opcodes
        if let Some(opcode) = str_opcode {
            let obj_expr = self.transpile_node(object)?;
            let mut call_args = vec![obj_expr];
            call_args.extend(args);
            return Ok(Some(SExpr::call(opcode, call_args)));
        }

        // Not a known method, return None to use default handling
        Ok(None)
    }

    fn get_call_name(&self, node: Node) -> Result<String, TranspileError> {
        match node.kind() {
            "identifier" => Ok(self.node_text(node).to_string()),
            "member_expression" => {
                let object = node.child_by_field_name("object").ok_or_else(|| {
                    TranspileError::Parse("member_expression missing object".into())
                })?;
                let property = node.child_by_field_name("property").ok_or_else(|| {
                    TranspileError::Parse("member_expression missing property".into())
                })?;

                let obj_name = self.get_call_name(object)?;
                let prop_name = self.node_text(property);

                Ok(format!("{}.{}", obj_name, prop_name))
            }
            _ => Err(TranspileError::Unsupported(format!(
                "call target type '{}'",
                node.kind()
            ))),
        }
    }

    fn transpile_member_expr(&self, node: Node) -> Result<SExpr, TranspileError> {
        let object = node
            .child_by_field_name("object")
            .ok_or_else(|| TranspileError::Parse("member_expression missing object".into()))?;
        let property = node
            .child_by_field_name("property")
            .ok_or_else(|| TranspileError::Parse("member_expression missing property".into()))?;

        let obj_expr = self.transpile_node(object)?;
        let prop_name = self.node_text(property);

        Ok(SExpr::call(
            "obj.get",
            vec![obj_expr, SExpr::string(prop_name).erase_type()],
        ))
    }

    fn transpile_subscript_expr(&self, node: Node) -> Result<SExpr, TranspileError> {
        let object = node
            .child_by_field_name("object")
            .ok_or_else(|| TranspileError::Parse("subscript_expression missing object".into()))?;
        let index = node
            .child_by_field_name("index")
            .ok_or_else(|| TranspileError::Parse("subscript_expression missing index".into()))?;

        let obj_expr = self.transpile_node(object)?;
        let idx_expr = self.transpile_node(index)?;

        // Determine whether to use list.get or obj.get based on index type:
        // - String literal: use obj.get (object property access)
        // - Number literal or other: use list.get (array index access)
        let index_kind = index.kind();
        let use_obj_get = index_kind == "string" || index_kind == "template_string";

        if use_obj_get {
            Ok(SExpr::call("obj.get", vec![obj_expr, idx_expr]))
        } else {
            Ok(SExpr::call("list.get", vec![obj_expr, idx_expr]))
        }
    }

    fn transpile_array(&self, node: Node) -> Result<SExpr, TranspileError> {
        let mut elements = Vec::new();
        let mut cursor = node.walk();

        for child in node.children(&mut cursor) {
            if child.is_named() {
                elements.push(self.transpile_node(child)?);
            }
        }

        Ok(SExpr::call("list.new", elements))
    }

    fn transpile_object(&self, node: Node) -> Result<SExpr, TranspileError> {
        let mut pairs = Vec::new();
        let mut cursor = node.walk();

        for child in node.children(&mut cursor) {
            if child.kind() == "pair" {
                let key = child
                    .child_by_field_name("key")
                    .ok_or_else(|| TranspileError::Parse("pair missing key".into()))?;
                let value = child
                    .child_by_field_name("value")
                    .ok_or_else(|| TranspileError::Parse("pair missing value".into()))?;

                let key_expr = match key.kind() {
                    "property_identifier" | "identifier" => {
                        SExpr::string(self.node_text(key)).erase_type()
                    }
                    "string" => {
                        let text = self.node_text(key);
                        SExpr::string(&text[1..text.len() - 1]).erase_type()
                    }
                    "number" => {
                        // Numeric keys like { 0: "a", 1: "b" }
                        SExpr::string(self.node_text(key)).erase_type()
                    }
                    "computed_property_name" => {
                        // Computed property: [expr]: value
                        // Get the inner expression (skip the brackets)
                        let inner = key.named_child(0).ok_or_else(|| {
                            TranspileError::Parse("empty computed property".into())
                        })?;
                        self.transpile_node(inner)?
                    }
                    _ => {
                        return Err(TranspileError::Unsupported(format!(
                            "object key type '{}'",
                            key.kind()
                        )));
                    }
                };

                // Generate pair as [key, value]
                pairs.push(SExpr::list(vec![key_expr, self.transpile_node(value)?]).erase_type());
            } else if child.kind() == "shorthand_property_identifier" {
                // { foo } is shorthand for { foo: foo }
                let name = self.node_text(child);
                pairs.push(
                    SExpr::list(vec![
                        SExpr::string(name).erase_type(),
                        SExpr::call("std.var", vec![SExpr::string(name).erase_type()]),
                    ])
                    .erase_type(),
                );
            }
        }

        Ok(SExpr::call("obj.new", pairs))
    }

    fn transpile_arrow_function(&self, node: Node) -> Result<SExpr, TranspileError> {
        let mut param_names = Vec::new();

        // Try "parameters" field first (for parenthesized params)
        if let Some(params) = node.child_by_field_name("parameters") {
            self.collect_params(params, &mut param_names);
        }
        // Try "parameter" field (for single unparenthesized param: x => ...)
        if let Some(param) = node.child_by_field_name("parameter") {
            if param.kind() == "identifier" {
                param_names.push(SExpr::string(self.node_text(param)).erase_type());
            }
        }

        // Get body
        let body = node
            .child_by_field_name("body")
            .ok_or_else(|| TranspileError::Parse("arrow_function missing body".into()))?;

        let body_expr = self.transpile_node(body)?;

        // Create std.lambda: ["std.lambda", [...params], body]
        Ok(SExpr::call(
            "std.lambda",
            vec![SExpr::list(param_names).erase_type(), body_expr],
        ))
    }

    fn collect_params(&self, params: Node, param_names: &mut Vec<SExpr>) {
        match params.kind() {
            "identifier" => {
                param_names.push(SExpr::string(self.node_text(params)).erase_type());
            }
            "formal_parameters" => {
                let mut cursor = params.walk();
                for child in params.children(&mut cursor) {
                    if child.kind() == "identifier" {
                        param_names.push(SExpr::string(self.node_text(child)).erase_type());
                    } else if child.kind() == "required_parameter" {
                        if let Some(pattern) = child.child_by_field_name("pattern") {
                            param_names.push(SExpr::string(self.node_text(pattern)).erase_type());
                        }
                    }
                }
            }
            _ => {}
        }
    }

    fn transpile_ternary(&self, node: Node) -> Result<SExpr, TranspileError> {
        let condition = node
            .child_by_field_name("condition")
            .ok_or_else(|| TranspileError::Parse("ternary missing condition".into()))?;
        let consequence = node
            .child_by_field_name("consequence")
            .ok_or_else(|| TranspileError::Parse("ternary missing consequence".into()))?;
        let alternative = node
            .child_by_field_name("alternative")
            .ok_or_else(|| TranspileError::Parse("ternary missing alternative".into()))?;

        Ok(SExpr::call(
            "std.if",
            vec![
                self.transpile_node(condition)?,
                self.transpile_node(consequence)?,
                self.transpile_node(alternative)?,
            ],
        ))
    }

    fn transpile_expression_statement(&self, node: Node) -> Result<SExpr, TranspileError> {
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            if child.is_named() {
                return self.transpile_node(child);
            }
        }
        Ok(SExpr::null().erase_type())
    }

    fn transpile_lexical_declaration(&self, node: Node) -> Result<SExpr, TranspileError> {
        // let x = 1, y = 2; -> ["std.seq", ["std.let", "x", 1], ["std.let", "y", 2]]
        let mut declarations = Vec::new();
        let mut cursor = node.walk();

        for child in node.children(&mut cursor) {
            if child.kind() == "variable_declarator" {
                declarations.push(self.transpile_variable_declarator(child)?);
            }
        }

        if declarations.len() == 1 {
            Ok(declarations.remove(0))
        } else {
            Ok(SExpr::call("std.seq", declarations))
        }
    }

    fn transpile_variable_declaration(&self, node: Node) -> Result<SExpr, TranspileError> {
        // var x = 1; (same as let for our purposes)
        self.transpile_lexical_declaration(node)
    }

    fn transpile_variable_declarator(&self, node: Node) -> Result<SExpr, TranspileError> {
        let name = node
            .child_by_field_name("name")
            .ok_or_else(|| TranspileError::Parse("variable_declarator missing name".into()))?;
        let value = node.child_by_field_name("value");

        let name_str = self.node_text(name);
        let value_expr = if let Some(val) = value {
            self.transpile_node(val)?
        } else {
            SExpr::null().erase_type()
        };

        Ok(SExpr::call(
            "std.let",
            vec![SExpr::string(name_str).erase_type(), value_expr],
        ))
    }

    fn transpile_if_statement(&self, node: Node) -> Result<SExpr, TranspileError> {
        let condition = node
            .child_by_field_name("condition")
            .ok_or_else(|| TranspileError::Parse("if_statement missing condition".into()))?;
        let consequence = node
            .child_by_field_name("consequence")
            .ok_or_else(|| TranspileError::Parse("if_statement missing consequence".into()))?;
        let alternative = node.child_by_field_name("alternative");

        // Condition is a parenthesized_expression, get the inner expression
        let cond_expr = self.transpile_node(condition)?;
        let then_expr = self.transpile_node(consequence)?;

        if let Some(alt) = alternative {
            let else_expr = self.transpile_else_clause(alt)?;
            Ok(SExpr::call("std.if", vec![cond_expr, then_expr, else_expr]))
        } else {
            Ok(SExpr::call("std.if", vec![cond_expr, then_expr]))
        }
    }

    fn transpile_else_clause(&self, node: Node) -> Result<SExpr, TranspileError> {
        // else_clause contains: "else" keyword + body (statement_block or if_statement for else-if)
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            if child.is_named() {
                return self.transpile_node(child);
            }
        }
        Ok(SExpr::null().erase_type())
    }

    fn transpile_while_statement(&self, node: Node) -> Result<SExpr, TranspileError> {
        let condition = node
            .child_by_field_name("condition")
            .ok_or_else(|| TranspileError::Parse("while_statement missing condition".into()))?;
        let body = node
            .child_by_field_name("body")
            .ok_or_else(|| TranspileError::Parse("while_statement missing body".into()))?;

        // Condition is a parenthesized_expression, get the inner expression
        let cond_expr = self.transpile_node(condition)?;
        let body_expr = self.transpile_node(body)?;

        Ok(SExpr::call("std.while", vec![cond_expr, body_expr]))
    }

    /// Transpile classic for-loop: for (init; cond; update) { body }
    /// Converts to: std.seq(init, std.while(cond, std.seq(body, update)))
    fn transpile_for_statement(&self, node: Node) -> Result<SExpr, TranspileError> {
        let initializer = node.child_by_field_name("initializer");
        let condition = node.child_by_field_name("condition");
        let increment = node.child_by_field_name("increment");
        let body = node
            .child_by_field_name("body")
            .ok_or_else(|| TranspileError::Parse("for_statement missing body".into()))?;

        // Build the while body: std.seq(body, update) if update exists
        let body_expr = self.transpile_node(body)?;
        let while_body = if let Some(incr) = increment {
            let incr_expr = self.transpile_node(incr)?;
            SExpr::call("std.seq", vec![body_expr, incr_expr])
        } else {
            body_expr
        };

        // Build condition (default to true if missing - infinite loop)
        let cond_expr = if let Some(cond) = condition {
            self.transpile_node(cond)?
        } else {
            SExpr::bool(true).erase_type()
        };

        // Build while loop
        let while_loop = SExpr::call("std.while", vec![cond_expr, while_body]);

        // Wrap with initializer if it exists
        if let Some(init) = initializer {
            let init_expr = self.transpile_node(init)?;
            Ok(SExpr::call("std.seq", vec![init_expr, while_loop]))
        } else {
            Ok(while_loop)
        }
    }

    /// Transpile switch statement: switch (expr) { case x: ...; default: ... }
    /// Converts to nested if-else: std.if(eq(expr, x), case_body, std.if(..., ..., default))
    fn transpile_switch_statement(&self, node: Node) -> Result<SExpr, TranspileError> {
        let value = node
            .child_by_field_name("value")
            .ok_or_else(|| TranspileError::Parse("switch_statement missing value".into()))?;
        let body = node
            .child_by_field_name("body")
            .ok_or_else(|| TranspileError::Parse("switch_statement missing body".into()))?;

        let value_expr = self.transpile_node(value)?;

        // Collect cases and default
        let mut cases: Vec<(SExpr, Vec<SExpr>)> = Vec::new(); // (condition_value, body_statements)
        let mut default_body: Vec<SExpr> = Vec::new();

        let mut cursor = body.walk();
        for child in body.children(&mut cursor) {
            match child.kind() {
                "switch_case" => {
                    // Case with value: case x:
                    if let Some(case_value) = child.child_by_field_name("value") {
                        let case_expr = self.transpile_node(case_value)?;
                        let mut body_stmts = Vec::new();

                        // Collect all statements in this case (children after the value)
                        let mut inner_cursor = child.walk();
                        let mut past_colon = false;
                        for inner_child in child.children(&mut inner_cursor) {
                            if inner_child.kind() == ":" {
                                past_colon = true;
                                continue;
                            }
                            if past_colon && inner_child.is_named() {
                                // Skip break statements in case bodies
                                if inner_child.kind() != "break_statement" {
                                    body_stmts.push(self.transpile_node(inner_child)?);
                                }
                            }
                        }

                        cases.push((case_expr, body_stmts));
                    }
                }
                "switch_default" => {
                    // Default case
                    let mut inner_cursor = child.walk();
                    let mut past_colon = false;
                    for inner_child in child.children(&mut inner_cursor) {
                        if inner_child.kind() == ":" {
                            past_colon = true;
                            continue;
                        }
                        if past_colon && inner_child.is_named() {
                            if inner_child.kind() != "break_statement" {
                                default_body.push(self.transpile_node(inner_child)?);
                            }
                        }
                    }
                }
                _ => {}
            }
        }

        // Build nested if-else from cases (reverse order to build from inside out)
        let default_expr = if default_body.is_empty() {
            SExpr::null().erase_type()
        } else if default_body.len() == 1 {
            default_body.into_iter().next().unwrap()
        } else {
            SExpr::call("std.seq", default_body)
        };

        let result =
            cases
                .into_iter()
                .rev()
                .fold(default_expr, |else_branch, (case_val, body_stmts)| {
                    let body_expr = if body_stmts.is_empty() {
                        SExpr::null().erase_type()
                    } else if body_stmts.len() == 1 {
                        body_stmts.into_iter().next().unwrap()
                    } else {
                        SExpr::call("std.seq", body_stmts)
                    };

                    let condition = SExpr::call("bool.eq", vec![value_expr.clone(), case_val]);

                    SExpr::call("std.if", vec![condition, body_expr, else_branch])
                });

        Ok(result)
    }

    fn transpile_for_in_statement(&self, node: Node) -> Result<SExpr, TranspileError> {
        // tree-sitter TS uses "for_in_statement" for both "for (x in obj)" and "for (x of arr)"
        // We need to check which operator is used by looking at the node's children
        let left = node
            .child_by_field_name("left")
            .ok_or_else(|| TranspileError::Parse("for_in_statement missing left".into()))?;
        let right = node
            .child_by_field_name("right")
            .ok_or_else(|| TranspileError::Parse("for_in_statement missing right".into()))?;
        let body = node
            .child_by_field_name("body")
            .ok_or_else(|| TranspileError::Parse("for_in_statement missing body".into()))?;

        // Detect if this is "for...in" (object keys) or "for...of" (array/iterable values)
        // In tree-sitter, the operator is a non-field child between left and right
        let is_for_in = {
            let mut cursor = node.walk();
            let mut found_in = false;
            for child in node.children(&mut cursor) {
                let text = self.node_text(child);
                if text == "in" {
                    found_in = true;
                    break;
                } else if text == "of" {
                    break;
                }
            }
            found_in
        };

        // Get the variable name from left (could be "const x", "let x", or just "x")
        let var_name = self.extract_for_variable(left)?;
        let right_expr = self.transpile_node(right)?;
        let body_expr = self.transpile_node(body)?;

        // For "for...in", we iterate over obj.keys(obj)
        // For "for...of", we iterate over the iterable directly
        let iter_expr = if is_for_in {
            SExpr::call("obj.keys", vec![right_expr])
        } else {
            right_expr
        };

        Ok(SExpr::call(
            "std.for",
            vec![SExpr::string(var_name).erase_type(), iter_expr, body_expr],
        ))
    }

    fn extract_for_variable(&self, node: Node) -> Result<String, TranspileError> {
        match node.kind() {
            "identifier" => Ok(self.node_text(node).to_string()),
            "lexical_declaration" => {
                // "const x" or "let x"
                let mut cursor = node.walk();
                for child in node.children(&mut cursor) {
                    if child.kind() == "variable_declarator" {
                        if let Some(name) = child.child_by_field_name("name") {
                            return Ok(self.node_text(name).to_string());
                        }
                    }
                }
                Err(TranspileError::Parse(
                    "for-of: could not extract variable name".into(),
                ))
            }
            _ => Err(TranspileError::Unsupported(format!(
                "for-of variable type '{}'",
                node.kind()
            ))),
        }
    }

    fn transpile_return_statement(&self, node: Node) -> Result<SExpr, TranspileError> {
        let mut cursor = node.walk();
        for child in node.children(&mut cursor) {
            if child.is_named() && child.kind() != "return" {
                let value = self.transpile_node(child)?;
                return Ok(SExpr::call("std.return", vec![value]));
            }
        }
        // Return with no value
        Ok(SExpr::call("std.return", vec![]))
    }

    fn transpile_block(&self, node: Node) -> Result<SExpr, TranspileError> {
        let mut statements = Vec::new();
        let mut cursor = node.walk();

        for child in node.children(&mut cursor) {
            if child.is_named() {
                let stmt = self.transpile_node(child)?;
                // Skip null statements (comments, empty statements)
                if !stmt.is_null() {
                    statements.push(stmt);
                }
            }
        }

        if statements.is_empty() {
            Ok(SExpr::null().erase_type())
        } else if statements.len() == 1 {
            Ok(statements.remove(0))
        } else {
            Ok(SExpr::call("std.seq", statements))
        }
    }
}
